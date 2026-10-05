import { Client, handle_file } from '@gradio/client';
import type { Generator } from './index.js';
import { WorkerError } from '../errors.js';

// El Space público de TripoSR en Hugging Face (gratis, MIT — código y
// pesos, ver sección 6.2 del plan). No es un REST simple: es una app
// Gradio con dos pasos encadenados (quitar fondo, después generar la
// malla), llamados con el protocolo del cliente oficial.
const TRIPOSR_SPACE = process.env.TRIPOSR_SPACE ?? 'stabilityai/TripoSR';
// Opcional pero recomendado: sin token, Hugging Face limita las
// llamadas anónimas por IP y el Space puede tardar en "despertar" si
// estaba dormido. Un token de cuenta gratuita alcanza.
const HF_TOKEN = process.env.HF_TOKEN as `hf_${string}` | undefined;

interface GradioFileOutput {
  url?: string;
  path?: string;
}

export const triposrGenerator: Generator = {
  name: 'triposr',
  async generate(photoUrl: string): Promise<Buffer> {
    let client: Client;
    try {
      client = await Client.connect(TRIPOSR_SPACE, HF_TOKEN ? { token: HF_TOKEN } : undefined);
    } catch (cause) {
      throw new WorkerError(
        'GEN_TRIPOSR_CONNECT_FAILED',
        `No se pudo conectar al Space de TripoSR: ${cause instanceof Error ? cause.message : String(cause)}`,
        { cause }
      );
    }

    // Paso 1: recorta/quita el fondo. Valores por default de la demo
    // oficial (0.85 de foreground ratio).
    const preprocessed = await client
      .predict('/preprocess', [handle_file(photoUrl), true, 0.85])
      .catch((cause: unknown) => {
        throw new WorkerError(
          'GEN_TRIPOSR_PREPROCESS_FAILED',
          `TripoSR falló al preprocesar la foto: ${cause instanceof Error ? cause.message : String(cause)}`,
          { cause }
        );
      });

    const processedImage = (preprocessed.data as [GradioFileOutput])[0];

    // Paso 2: genera la malla. 256 = resolución de marching cubes por
    // default de la demo; devuelve [obj, glb] y solo nos interesa el glb.
    const generated = await client
      .predict('/generate', [processedImage, 256])
      .catch((cause: unknown) => {
        throw new WorkerError(
          'GEN_TRIPOSR_GENERATE_FAILED',
          `TripoSR falló al generar la malla: ${cause instanceof Error ? cause.message : String(cause)}`,
          { cause }
        );
      });

    const [, glbFile] = generated.data as [GradioFileOutput, GradioFileOutput];

    if (!glbFile?.url) {
      throw new WorkerError('GEN_TRIPOSR_NO_GLB_URL', 'TripoSR no devolvió una URL de modelo .glb.');
    }

    const response = await fetch(glbFile.url);
    if (!response.ok) {
      throw new WorkerError(
        'GEN_TRIPOSR_DOWNLOAD_FAILED',
        `No se pudo descargar el .glb generado (${response.status}).`
      );
    }

    return Buffer.from(await response.arrayBuffer());
  },
};
