/**
 * CLI "Estudio 3D" (A-202): convierte una foto en `modelo.glb` +
 * `modelo.usdz` + `poster.webp` + `manifest.json`, listos para copiarlos
 * a `ASCUA-DEMO-PAGINA/content/restaurants/<slug>/assets/platos/<id>/`.
 *
 * No usa Supabase ni el loop de `src/index.ts`: es la versión de mesa de
 * trabajo del mismo pipeline (A-204: cada plato a su medida real, no los
 * 16 cm fijos de antes), para producir assets de la demo a mano, uno por
 * uno, sin levantar el worker completo. Reutiliza los mismos pasos que
 * usa el worker real: `pipeline/optimize.ts`, `pipeline/normalize-scale.ts`
 * (con la escala pedida), `pipeline/poster.ts`, y el `Generator`
 * intercambiable de `generators/index.ts`. Lo único que cambia es cómo
 * se obtiene el .usdz (`convert-usdz-docker.ts`, pensado para correr en
 * Windows sin el contenedor completo del worker) y cómo se le entrega la
 * foto al generador (`serve-local-file.ts`, un servidor HTTP efímero,
 * porque `Generator.generate` espera una URL pública).
 *
 * Uso:
 *   pnpm asset:build -- --input <foto.jpg> --out <dir> --escala-cm <n> [--generador instantmesh]
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { getGeneratorByName } from '../generators/index.js';
import { optimizeGlb } from '../pipeline/optimize.js';
import { normalizeScale, measureBoundsCm } from '../pipeline/normalize-scale.js';
import { renderPoster } from '../pipeline/poster.js';
import { convertToUsdzViaDocker } from './convert-usdz-docker.js';
import { serveLocalFile } from './serve-local-file.js';
import { WorkerError, describeError } from '../errors.js';

/** Presupuestos de peso (CLAUDE.md de ambos repos, sección 0.2). */
export const GLB_MAX_BYTES = 5 * 1024 * 1024;
export const USDZ_MAX_BYTES = 8 * 1024 * 1024;

/** Licencia de uso comercial de cada generador — se registra en el manifest para auditoría. */
export const GENERATOR_LICENSES: Record<string, string> = {
  instantmesh: 'Apache-2.0 (TencentARC/InstantMesh, Hugging Face Space)',
  triposr: 'MIT (stabilityai/TripoSR, Hugging Face Space — Space roto hoy, no usar)',
  meshy: 'Comercial — Meshy.ai (requiere plan de pago, no usado por default)',
};

export interface BuildAssetOptions {
  /** Ruta local de la foto de entrada (jpg/jpeg/png/webp). */
  inputPhotoPath: string;
  /** Carpeta donde se escriben modelo.glb, modelo.usdz, poster.webp y manifest.json. */
  outDir: string;
  /** Lado más largo del plato servido, en centímetros. */
  escalaCm: number;
  /** Nombre del generador ('instantmesh' por default). */
  generatorName?: string;
}

export interface BuildAssetResult {
  glbPath: string;
  usdzPath: string | null;
  posterPath: string;
  manifestPath: string;
  manifest: Manifest;
}

interface Manifest {
  generadoEn: string;
  generador: string;
  licenciaGenerador: string;
  escalaCmSolicitada: number;
  dimensionesCm: { ancho: number; alto: number; profundidad: number };
  archivos: {
    glb: { bytes: number; sha256: string };
    usdz: { bytes: number; sha256: string } | null;
    poster: { bytes: number; sha256: string };
  };
}

/** Pasos del pipeline, inyectables para pruebas sin red ni Docker reales. */
export interface BuildAssetSteps {
  generate(localPhotoPath: string, generatorName: string): Promise<Buffer>;
  optimize(rawGlb: Buffer): Promise<Buffer>;
  normalize(optimizedGlb: Buffer, targetSizeMeters: number): Promise<Buffer>;
  measureBounds(glb: Buffer): Promise<{ widthCm: number; heightCm: number; depthCm: number }>;
  toUsdz(optimizedGlb: Buffer): Promise<Buffer>;
  renderPoster(glb: Buffer): Promise<Buffer>;
}

async function generateFromLocalPhoto(localPhotoPath: string, generatorName: string): Promise<Buffer> {
  const gen = getGeneratorByName(generatorName);
  const server = await serveLocalFile(localPhotoPath);
  try {
    return await gen.generate(server.url);
  } finally {
    await server.close();
  }
}

export const defaultSteps: BuildAssetSteps = {
  generate: generateFromLocalPhoto,
  optimize: optimizeGlb,
  normalize: normalizeScale,
  measureBounds: measureBoundsCm,
  toUsdz: convertToUsdzViaDocker,
  renderPoster,
};

function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

/**
 * Orquesta el pipeline completo para un plato y escribe sus 4 archivos.
 *
 * El .usdz es el único paso no fatal: si Docker no está corriendo o la
 * imagen no está construida, el modelo igual sirve para AR en Android
 * (Scene Viewer solo necesita el .glb) — mismo criterio que ya usa
 * `src/index.ts` con `pipeline/usdz.ts`.
 *
 * @param options - Foto de entrada, carpeta de salida y escala real.
 * @param steps - Pasos del pipeline (por default, los reales); las
 * pruebas inyectan fakes para no depender de red ni de Docker.
 */
export async function buildAsset(
  options: BuildAssetOptions,
  steps: BuildAssetSteps = defaultSteps
): Promise<BuildAssetResult> {
  const { inputPhotoPath, outDir, escalaCm, generatorName = 'instantmesh' } = options;

  if (escalaCm <= 0) {
    throw new WorkerError('CLI_BUILD_ASSET_INVALID_ESCALA', 'La escala en centímetros debe ser un número positivo.');
  }

  await mkdir(outDir, { recursive: true });

  const rawGlb = await steps.generate(inputPhotoPath, generatorName);
  const optimizedGlb = await steps.optimize(rawGlb);
  const normalizedGlb = await steps.normalize(optimizedGlb, escalaCm / 100);

  if (normalizedGlb.byteLength > GLB_MAX_BYTES) {
    throw new WorkerError(
      'CLI_BUILD_ASSET_GLB_TOO_LARGE',
      `El .glb pesa ${(normalizedGlb.byteLength / 1024 / 1024).toFixed(2)} MB, supera el presupuesto de ${(
        GLB_MAX_BYTES /
        1024 /
        1024
      ).toFixed(2)} MB.`
    );
  }

  const dimensionesCm = await steps.measureBounds(normalizedGlb);

  // No fatal: sin .usdz el modelo igual sirve para AR en Android (mismo
  // criterio que src/index.ts con pipeline/usdz.ts) — solo se pierde
  // Quick Look en iPhone hasta que Juan reintente con Docker corriendo.
  let usdz: Buffer | null = null;
  try {
    const candidate = await steps.toUsdz(optimizedGlb);
    if (candidate.byteLength > USDZ_MAX_BYTES) {
      const { code } = describeError(
        new WorkerError(
          'CLI_BUILD_ASSET_USDZ_TOO_LARGE',
          `El .usdz pesa ${(candidate.byteLength / 1024 / 1024).toFixed(2)} MB, supera el presupuesto de ${(
            USDZ_MAX_BYTES /
            1024 /
            1024
          ).toFixed(2)} MB.`
        )
      );
      console.error(`[${code}] .usdz descartado por peso, sigo solo con .glb.`);
    } else {
      usdz = candidate;
    }
  } catch (error) {
    const { code, message } = describeError(error);
    console.error(`[${code}] .usdz no disponible, sigo solo con .glb — ${message}`);
  }

  const poster = await steps.renderPoster(normalizedGlb);

  const glbPath = `${outDir}/modelo.glb`;
  const usdzPath = usdz ? `${outDir}/modelo.usdz` : null;
  const posterPath = `${outDir}/poster.webp`;
  const manifestPath = `${outDir}/manifest.json`;

  await writeFile(glbPath, normalizedGlb);
  if (usdz && usdzPath) await writeFile(usdzPath, usdz);
  await writeFile(posterPath, poster);

  const manifest: Manifest = {
    generadoEn: new Date().toISOString(),
    generador: generatorName,
    licenciaGenerador: GENERATOR_LICENSES[generatorName] ?? 'Desconocida — registrar antes de usar en producción.',
    escalaCmSolicitada: escalaCm,
    dimensionesCm: {
      ancho: Number(dimensionesCm.widthCm.toFixed(2)),
      alto: Number(dimensionesCm.heightCm.toFixed(2)),
      profundidad: Number(dimensionesCm.depthCm.toFixed(2)),
    },
    archivos: {
      glb: { bytes: normalizedGlb.byteLength, sha256: sha256(normalizedGlb) },
      usdz: usdz ? { bytes: usdz.byteLength, sha256: sha256(usdz) } : null,
      poster: { bytes: poster.byteLength, sha256: sha256(poster) },
    },
  };

  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));

  return { glbPath, usdzPath, posterPath, manifestPath, manifest };
}

function parseArgs(argv: string[]): BuildAssetOptions {
  const get = (flag: string): string | undefined => {
    const index = argv.indexOf(flag);
    return index === -1 ? undefined : argv[index + 1];
  };

  const inputPhotoPath = get('--input');
  const outDir = get('--out');
  const escalaCmRaw = get('--escala-cm');
  const generatorName = get('--generador');

  if (!inputPhotoPath || !outDir || !escalaCmRaw) {
    throw new WorkerError(
      'CLI_BUILD_ASSET_MISSING_ARGS',
      'Uso: build-asset --input <foto.jpg> --out <dir> --escala-cm <n> [--generador instantmesh]'
    );
  }

  const escalaCm = Number(escalaCmRaw);
  if (!Number.isFinite(escalaCm) || escalaCm <= 0) {
    throw new WorkerError('CLI_BUILD_ASSET_INVALID_ESCALA', `--escala-cm debe ser un número positivo, recibí "${escalaCmRaw}".`);
  }

  return { inputPhotoPath, outDir, escalaCm, generatorName };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  console.log(`Generando modelo 3D desde "${options.inputPhotoPath}" (escala ${options.escalaCm} cm)...`);

  const result = await buildAsset(options);

  console.log(`✅ Listo en ${options.outDir}:`);
  console.log(`   - modelo.glb (${(result.manifest.archivos.glb.bytes / 1024).toFixed(0)} KB)`);
  console.log(
    result.usdzPath
      ? `   - modelo.usdz (${(result.manifest.archivos.usdz!.bytes / 1024).toFixed(0)} KB)`
      : '   - modelo.usdz: NO generado (ver aviso arriba; el modelo igual sirve para Android)'
  );
  console.log(`   - poster.webp (${(result.manifest.archivos.poster.bytes / 1024).toFixed(0)} KB)`);
  console.log(`   - manifest.json`);
}

// Permitir correr directo desde pnpm scripts.
if (process.argv[1] && process.argv[1].endsWith('build-asset.ts')) {
  main().catch((error) => {
    const { code, message } = describeError(error);
    console.error(`❌ [${code}] ${message}`);
    process.exit(1);
  });
}
