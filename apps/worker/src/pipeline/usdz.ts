import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile, readFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { WorkerError } from '../errors.js';

const execFileAsync = promisify(execFile);

// usd_from_gltf corre dentro del Dockerfile de este worker (Node +
// Python + USD): así iOS tiene su .usdz sin necesitar una Mac (sección 1
// del plan). El binario se instala a nivel de sistema, no por npm.
export async function convertToUsdz(optimizedGlb: Buffer): Promise<Buffer> {
  const inputPath = join(tmpdir(), `${randomUUID()}.glb`);
  const outputPath = join(tmpdir(), `${randomUUID()}.usdz`);

  await writeFile(inputPath, optimizedGlb);

  try {
    try {
      await execFileAsync('usd_from_gltf', [inputPath, outputPath]);
    } catch (cause) {
      throw new WorkerError(
        'PIPELINE_USDZ_CONVERSION_FAILED',
        `usd_from_gltf falló convirtiendo a .usdz: ${cause instanceof Error ? cause.message : String(cause)}`,
        { cause }
      );
    }

    return await readFile(outputPath);
  } finally {
    await Promise.all([
      unlink(inputPath).catch(() => {}),
      unlink(outputPath).catch(() => {}),
    ]);
  }
}
