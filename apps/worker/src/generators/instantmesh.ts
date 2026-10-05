import { Client, handle_file } from '@gradio/client';
import type { Generator } from './index.js';
import { WorkerError } from '../errors.js';

// Space público y gratis de InstantMesh (TencentARC, Apache 2.0) en
// Hugging Face — a diferencia del Space oficial de TripoSR (roto y sin
// mantenimiento: issue abierto "not working" y PRs de arreglo sin
// mergear), este corre con réplicas activas y responde de verdad. Tres
// pasos encadenados en la misma sesión del cliente: preprocesar (quitar
// fondo), generar multi-vistas (GPU, ~50s) y reconstruir la malla 3D.
const INSTANTMESH_SPACE = process.env.INSTANTMESH_SPACE ?? 'TencentARC/InstantMesh';
const HF_TOKEN = process.env.HF_TOKEN as `hf_${string}` | undefined;

interface GradioFileOutput {
  url?: string;
  path?: string;
}

export const instantmeshGenerator: Generator = {
  name: 'instantmesh',
  async generate(photoUrl: string): Promise<Buffer> {
    let client: Client;
    try {
      client = await Client.connect(INSTANTMESH_SPACE, HF_TOKEN ? { token: HF_TOKEN } : undefined);
    } catch (cause) {
      throw new WorkerError(
        'GEN_INSTANTMESH_CONNECT_FAILED',
        `No se pudo conectar al Space de InstantMesh: ${cause instanceof Error ? cause.message : String(cause)}`,
        { cause }
      );
    }

    const photoResponse = await fetch(photoUrl);
    if (!photoResponse.ok) {
      throw new WorkerError(
        'GEN_INSTANTMESH_PHOTO_DOWNLOAD_FAILED',
        `No se pudo descargar la foto de entrada (${photoResponse.status}).`
      );
    }
    const photoBuffer = Buffer.from(await photoResponse.arrayBuffer());

    const preprocessed = await client
      .predict('/preprocess', [handle_file(photoBuffer), true])
      .catch((cause: unknown) => {
        throw new WorkerError(
          'GEN_INSTANTMESH_PREPROCESS_FAILED',
          `InstantMesh falló al preprocesar la foto: ${cause instanceof Error ? cause.message : String(cause)}`,
          { cause }
        );
      });
    const processedImage = (preprocessed.data as [GradioFileOutput])[0];

    // 75 pasos / seed 42 = valores por default de la demo oficial.
    await client.predict('/generate_mvs', [processedImage, 75, 42]).catch((cause: unknown) => {
      throw new WorkerError(
        'GEN_INSTANTMESH_MVS_FAILED',
        `InstantMesh falló al generar las multi-vistas: ${cause instanceof Error ? cause.message : String(cause)}`,
        { cause }
      );
    });

    // Sin parámetros a propósito: usa el resultado del paso anterior
    // guardado en el estado de sesión del Space (mismo cliente = misma
    // sesión).
    const made = await client.predict('/make3d', []).catch((cause: unknown) => {
      throw new WorkerError(
        'GEN_INSTANTMESH_MAKE3D_FAILED',
        `InstantMesh falló al reconstruir la malla 3D: ${cause instanceof Error ? cause.message : String(cause)}`,
        { cause }
      );
    });

    const [, glbFile] = made.data as [GradioFileOutput, GradioFileOutput];
    if (!glbFile?.url) {
      throw new WorkerError('GEN_INSTANTMESH_NO_GLB_URL', 'InstantMesh no devolvió una URL de modelo .glb.');
    }

    const glbResponse = await fetch(glbFile.url);
    if (!glbResponse.ok) {
      throw new WorkerError(
        'GEN_INSTANTMESH_DOWNLOAD_FAILED',
        `No se pudo descargar el .glb generado (${glbResponse.status}).`
      );
    }

    return Buffer.from(await glbResponse.arrayBuffer());
  },
};
