import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile, readFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { WorkerError } from '../errors.js';

const execFileAsync = promisify(execFile);

// gltf-transform CLI como subproceso: 15 MB → 1-2 MB (sección 1 del
// plan). Necesita el binario `gltf-transform` en el PATH — lo instala el
// Dockerfile globalmente, y package.json lo trae como dependencia para
// que `pnpm dev` en local también lo encuentre.

// Sin --compress meshopt: marca EXT_meshopt_compression como "required"
// en el .glb, y <model-viewer> necesita resolver un decoder aparte para
// eso — en la práctica algunos celulares se quedan colgados en
// "cargando" en vez de mostrar el modelo.
// --texture-compress auto (no webp): usd_from_gltf (paso .usdz) es de
// 2020 y no reconoce EXT_texture_webp — con "auto" se queda en jpeg/png,
// que sí entiende, y de paso conserva compatibilidad amplia en
// navegadores viejos.
//
// --simplify-error 0.01 es lo que hace que --simplify sirva de algo: el
// simplificador para en cuanto alcanza el error permitido, y con el
// default (0.001) nunca llega al ratio pedido. Medido sobre un GLB de
// TRELLIS: con `--simplify 0.5` y el error por default quedaba en 5.5 MB
// / 150k triángulos; con estos valores baja a 1.9 MB / 45k, que sigue
// siendo más malla de la que traían los modelos de 512.
const BASE_ARGS = [
  '--simplify',
  '0.15',
  '--simplify-error',
  '0.01',
  '--texture-size',
  '1024',
  '--compress',
  'false',
];

export async function optimizeGlb(rawGlb: Buffer): Promise<Buffer> {
  const inputPath = join(tmpdir(), `${randomUUID()}-raw.glb`);
  const outputPath = join(tmpdir(), `${randomUUID()}-optimized.glb`);

  await writeFile(inputPath, rawGlb);

  try {
    try {
      await execFileAsync('gltf-transform', [
        'optimize',
        inputPath,
        outputPath,
        ...BASE_ARGS,
        '--texture-compress',
        'auto',
      ]);
    } catch (cause) {
      // El paso textureCompress depende de sharp/libvips y revienta en
      // algunos entornos ("colourspace: parameter space not set" en
      // Windows) aunque el resto del pipeline esté sano. La geometría es
      // el 97% del peso de un GLB de TRELLIS, así que reintentar sin
      // tocar texturas conserva casi toda la ganancia; abortar el job
      // entero por esto no.
      try {
        await execFileAsync('gltf-transform', ['optimize', inputPath, outputPath, ...BASE_ARGS]);
      } catch {
        throw new WorkerError(
          'PIPELINE_OPTIMIZE_GLTF_TRANSFORM_FAILED',
          `gltf-transform falló optimizando el .glb: ${cause instanceof Error ? cause.message : String(cause)}`,
          { cause }
        );
      }
    }

    return await readFile(outputPath);
  } finally {
    await Promise.all([
      unlink(inputPath).catch(() => {}),
      unlink(outputPath).catch(() => {}),
    ]);
  }
}
