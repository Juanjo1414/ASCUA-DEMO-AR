/**
 * Convierte un .glb a .usdz corriendo `usd_from_gltf` dentro de un
 * contenedor Docker desechable, en vez del binario del sistema que usa
 * `pipeline/usdz.ts` dentro del contenedor completo del worker real.
 *
 * En Windows `usd_from_gltf` no existe como binario nativo (CLAUDE.md,
 * sección 0.2: "en Windows la CLI de USDZ se ejecuta vía Docker
 * Desktop"), así que `build-asset.ts` (A-202) usa esta versión en vez de
 * `pipeline/usdz.ts`. La imagen (`Dockerfile.usdz`) es mucho más chica
 * que la del worker completo (sin Chromium, sin cliente de Supabase):
 * solo trae el binario `usd_from_gltf` sobre el mismo digest pinneado
 * (`marlon360/usd-from-gltf`) que ya usa `apps/worker/Dockerfile`.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile, readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorkerError } from '../errors.js';

const execFileAsync = promisify(execFile);

const DEFAULT_IMAGE = 'menu-ar-usdz-tool';

/**
 * @param optimizedGlb - Modelo ya optimizado y con la escala normalizada.
 * @param dockerImage - Tag de la imagen construida con `Dockerfile.usdz`
 * (por default `menu-ar-usdz-tool`, o `USDZ_DOCKER_IMAGE` del entorno).
 * @returns El archivo .usdz resultante.
 * @throws WorkerError si Docker no está corriendo o la imagen no existe —
 * quien llama (`build-asset.ts`) trata esto como no fatal, igual que
 * `pipeline/usdz.ts`: el modelo sigue sirviendo para AR en Android sin él.
 */
export async function convertToUsdzViaDocker(
  optimizedGlb: Buffer,
  dockerImage: string = process.env.USDZ_DOCKER_IMAGE ?? DEFAULT_IMAGE
): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), 'usdz-'));
  const inputPath = join(dir, 'in.glb');
  const outputPath = join(dir, 'out.usdz');

  await writeFile(inputPath, optimizedGlb);

  try {
    try {
      await execFileAsync('docker', [
        'run',
        '--rm',
        '-v',
        `${dir}:/data`,
        dockerImage,
        '/data/in.glb',
        '/data/out.usdz',
      ]);
    } catch (cause) {
      throw new WorkerError(
        'CLI_USDZ_DOCKER_FAILED',
        `No se pudo convertir a .usdz con Docker (¿Docker Desktop está corriendo y la imagen "${dockerImage}" está construida con Dockerfile.usdz?): ${
          cause instanceof Error ? cause.message : String(cause)
        }`,
        { cause }
      );
    }

    return await readFile(outputPath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
