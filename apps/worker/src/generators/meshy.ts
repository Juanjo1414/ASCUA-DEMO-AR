import type { Generator } from './index.js';
import { WorkerError } from '../errors.js';

const MESHY_API_KEY = process.env.MESHY_API_KEY;
const MESHY_API_BASE = 'https://api.meshy.ai/openapi/v1/image-to-3d';
const POLL_INTERVAL_MS = 5000;
const MAX_POLL_ATTEMPTS = 60; // ~5 minutos

interface MeshyCreateTaskResponse {
  id: string;
}

interface MeshyTaskStatusResponse {
  status: 'PENDING' | 'IN_PROGRESS' | 'SUCCEEDED' | 'FAILED';
  model_urls?: { glb?: string };
  task_error?: { message?: string };
}

// ⚠️ No verificado contra la documentación en vivo de Meshy en esta
// sesión (sin red disponible): revisar nombres de campo antes de usar en
// producción. Además, sección 6.2 del plan — esto asume el plan de pago;
// en el plan gratuito los modelos ya no se pueden descargar.
export const meshyGenerator: Generator = {
  name: 'meshy',
  async generate(photoUrl: string): Promise<Buffer> {
    if (!MESHY_API_KEY) {
      throw new WorkerError('GEN_MESHY_MISSING_API_KEY', 'Falta MESHY_API_KEY en el entorno.');
    }

    const createResponse = await fetch(MESHY_API_BASE, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${MESHY_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ image_url: photoUrl, enable_pbr: false }),
    });

    if (!createResponse.ok) {
      throw new WorkerError(
        'GEN_MESHY_CREATE_TASK_FAILED',
        `Meshy respondió ${createResponse.status} al crear la tarea.`
      );
    }

    const { id: taskId } = (await createResponse.json()) as MeshyCreateTaskResponse;

    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

      const statusResponse = await fetch(`${MESHY_API_BASE}/${taskId}`, {
        headers: { Authorization: `Bearer ${MESHY_API_KEY}` },
      });
      const task = (await statusResponse.json()) as MeshyTaskStatusResponse;

      if (task.status === 'SUCCEEDED' && task.model_urls?.glb) {
        const modelResponse = await fetch(task.model_urls.glb);
        return Buffer.from(await modelResponse.arrayBuffer());
      }

      if (task.status === 'FAILED') {
        throw new WorkerError(
          'GEN_MESHY_TASK_FAILED',
          task.task_error?.message ?? 'Meshy falló al generar el modelo.'
        );
      }
    }

    throw new WorkerError('GEN_MESHY_POLL_TIMEOUT', 'Meshy no terminó a tiempo (timeout de polling).');
  },
};
