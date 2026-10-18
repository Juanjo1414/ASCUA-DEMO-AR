import { describe, expect, it, afterEach } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildAsset,
  GLB_MAX_BYTES,
  USDZ_MAX_BYTES,
  type BuildAssetSteps,
} from './build-asset.js';

// Los 4 pasos del pipeline real (generador, gltf-transform, Docker,
// puppeteer) no corren en esta prueba: se inyectan fakes para verificar
// solo la orquestación de build-asset.ts (presupuestos, manifest,
// archivos escritos) sin depender de red ni de Docker.
function fakeSteps(overrides: Partial<BuildAssetSteps> = {}): BuildAssetSteps {
  return {
    generate: async () => Buffer.from('raw-glb'),
    optimize: async (raw) => raw,
    normalize: async (optimized) => optimized,
    measureBounds: async () => ({ widthCm: 25, heightCm: 8, depthCm: 25 }),
    toUsdz: async () => Buffer.from('usdz-bytes'),
    renderPoster: async () => Buffer.from('poster-bytes'),
    ...overrides,
  };
}

describe('buildAsset', () => {
  let outDir: string;

  afterEach(async () => {
    if (outDir) await rm(outDir, { recursive: true, force: true });
  });

  it('produce los 4 archivos con el manifest correcto', async () => {
    outDir = await mkdtemp(join(tmpdir(), 'build-asset-'));

    const result = await buildAsset(
      { inputPhotoPath: 'foto.jpg', outDir, escalaCm: 25, generatorName: 'instantmesh' },
      fakeSteps()
    );

    expect(await readFile(result.glbPath, 'utf8')).toBe('raw-glb');
    expect(result.usdzPath).not.toBeNull();
    expect(await readFile(result.usdzPath!, 'utf8')).toBe('usdz-bytes');
    expect(await readFile(result.posterPath, 'utf8')).toBe('poster-bytes');

    const manifest = JSON.parse(await readFile(result.manifestPath, 'utf8'));
    expect(manifest.generador).toBe('instantmesh');
    expect(manifest.licenciaGenerador).toMatch(/Apache-2.0/);
    expect(manifest.escalaCmSolicitada).toBe(25);
    expect(manifest.dimensionesCm).toEqual({ ancho: 25, alto: 8, profundidad: 25 });
    expect(manifest.archivos.glb.bytes).toBe(Buffer.from('raw-glb').byteLength);
    expect(manifest.archivos.usdz.bytes).toBe(Buffer.from('usdz-bytes').byteLength);
    expect(manifest.archivos.poster.bytes).toBe(Buffer.from('poster-bytes').byteLength);
  });

  it('rechaza una escala en centímetros que no sea positiva', async () => {
    outDir = await mkdtemp(join(tmpdir(), 'build-asset-'));

    await expect(
      buildAsset({ inputPhotoPath: 'foto.jpg', outDir, escalaCm: 0 }, fakeSteps())
    ).rejects.toThrow(/positivo/);
  });

  it('falla si el .glb normalizado supera el presupuesto de 5 MB', async () => {
    outDir = await mkdtemp(join(tmpdir(), 'build-asset-'));
    const demasiadoGrande = Buffer.alloc(GLB_MAX_BYTES + 1);

    await expect(
      buildAsset(
        { inputPhotoPath: 'foto.jpg', outDir, escalaCm: 25 },
        fakeSteps({ normalize: async () => demasiadoGrande })
      )
    ).rejects.toThrow(/presupuesto/);
  });

  it('descarta el .usdz si supera 8 MB pero sigue produciendo el .glb', async () => {
    outDir = await mkdtemp(join(tmpdir(), 'build-asset-'));
    const usdzDemasiadoGrande = Buffer.alloc(USDZ_MAX_BYTES + 1);

    const result = await buildAsset(
      { inputPhotoPath: 'foto.jpg', outDir, escalaCm: 25 },
      fakeSteps({ toUsdz: async () => usdzDemasiadoGrande })
    );

    expect(result.usdzPath).toBeNull();
    expect(result.manifest.archivos.usdz).toBeNull();
    // El .glb y el poster se generaron igual.
    expect(await readFile(result.glbPath, 'utf8')).toBe('raw-glb');
  });

  it('sigue solo con el .glb si la conversión a .usdz falla (Docker no disponible)', async () => {
    outDir = await mkdtemp(join(tmpdir(), 'build-asset-'));

    const result = await buildAsset(
      { inputPhotoPath: 'foto.jpg', outDir, escalaCm: 25 },
      fakeSteps({
        toUsdz: async () => {
          throw new Error('docker: command not found');
        },
      })
    );

    expect(result.usdzPath).toBeNull();
    expect(result.manifest.archivos.usdz).toBeNull();
    expect(await readFile(result.glbPath, 'utf8')).toBe('raw-glb');
  });
});
