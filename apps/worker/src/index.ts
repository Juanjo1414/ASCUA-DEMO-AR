import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import type { Database } from '@menu-ar/db';
import { generator } from './generators/index.js';
import { optimizeGlb } from './pipeline/optimize.js';
import { normalizeScale } from './pipeline/normalize-scale.js';
import { convertToUsdz } from './pipeline/usdz.js';
import { renderPoster } from './pipeline/poster.js';
import { uploadAssets } from './pipeline/upload.js';
import { shouldRetry, computeBackoffMs, MAX_ATTEMPTS } from './retry.js';
import { WorkerError, describeError } from './errors.js';
import { assertPublicHttpUrl } from './ssrf-guard.js';

const POLL_INTERVAL_MS = 10_000;

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new WorkerError(
    'WORKER_MISSING_ENV',
    'Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el entorno.'
  );
}

const supabase = createClient<Database>(supabaseUrl, serviceRoleKey);

type Job = Database['public']['Tables']['jobs']['Row'];

async function claimNextJob(): Promise<Job | null> {
  const { data, error } = await supabase.rpc('claim_next_job');

  if (error) {
    console.error('[WORKER_CLAIM_JOB_FAILED]', error.message);
    return null;
  }

  return data?.[0] ?? null;
}

// Paso 2 del flujo (sección "Fase 5"): descarga la foto original, le
// quita el EXIF (las fotos de celular traen GPS — la ubicación exacta de
// la cocina no es un dato que el negocio quiera guardar) y re-sube la
// versión limpia. El generador y todo lo que sigue usan esta URL, nunca
// la original.
async function stripExifAndReupload(photoUrl: string, dishId: string): Promise<string> {
  // CN-002 (segunda capa): la API ya valida que sourcePhoto sea del
  // bucket dish-photos, pero este fetch corre con service role — no
  // confiar solo en esa capa antes de tocar red con esas credenciales.
  await assertPublicHttpUrl(photoUrl);

  const response = await fetch(photoUrl);
  if (!response.ok) {
    throw new WorkerError(
      'WORKER_PHOTO_DOWNLOAD_FAILED',
      `No se pudo descargar la foto original (${response.status}).`
    );
  }

  const raw = Buffer.from(await response.arrayBuffer());
  // sharp re-codifica la imagen sin pedir withMetadata(): descarta el
  // EXIF por default, no hace falta limpiarlo campo por campo.
  const stripped = await sharp(raw).jpeg().toBuffer();

  const path = `${dishId}/source-${Date.now()}.jpg`;
  const { error } = await supabase.storage
    .from('dish-photos')
    .upload(path, stripped, { contentType: 'image/jpeg', upsert: true });

  if (error) {
    throw new WorkerError(
      'WORKER_PHOTO_REUPLOAD_FAILED',
      `No se pudo re-subir la foto sin EXIF: ${error.message}`
    );
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from('dish-photos').getPublicUrl(path);

  return publicUrl;
}

async function notifyWebhook(restaurantId: string): Promise<void> {
  const webhookUrl = process.env.WEB_WEBHOOK_URL;
  if (!webhookUrl) return;

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.REVALIDATE_SECRET
          ? { 'x-revalidate-secret': process.env.REVALIDATE_SECRET }
          : {}),
      },
      body: JSON.stringify({ restaurantId }),
    });
  } catch (error) {
    // No revienta el job por esto: el peor caso es que el menú público
    // tarde hasta la próxima revalidación de ISR (1 hora, Fase 2) en
    // mostrar el modelo nuevo.
    console.error('[WORKER_WEBHOOK_NOTIFY_FAILED]', error);
  }
}

async function processJob(job: Job): Promise<void> {
  try {
    const cleanPhotoUrl = await stripExifAndReupload(job.source_photo, job.dish_id);

    const rawGlb = await generator.generate(cleanPhotoUrl);
    const optimizedGlb = await normalizeScale(await optimizeGlb(rawGlb));

    // No fatal: sin .usdz el modelo igual sirve para AR en Android
    // (WebXR / Scene Viewer, que solo necesitan el .glb) — solo se
    // pierde Quick Look en iPhone. Mejor publicar con AR parcial que no
    // publicar nada.
    let usdz: Buffer | null = null;
    try {
      usdz = await convertToUsdz(optimizedGlb);
    } catch (error) {
      const { code, message } = describeError(error);
      console.error(`Job ${job.id}: .usdz no disponible, sigo solo con .glb — [${code}] ${message}`);
    }

    const poster = await renderPoster(optimizedGlb);

    const assets = await uploadAssets(supabase, job.dish_id, {
      glb: optimizedGlb,
      usdz,
      poster,
    });

    // is_active=false: pendiente de aprobación del dueño. Solo el clic
    // de "Aprobar y publicar" en la Fase 4 lo activa y desactiva el
    // anterior.
    await supabase.from('dish_assets').insert({
      dish_id: job.dish_id,
      glb_url: assets.glbUrl,
      usdz_url: assets.usdzUrl,
      poster_url: assets.posterUrl,
      bytes_glb: assets.bytesGlb,
      triangles: null,
      generator: generator.name,
      is_active: false,
    });

    await supabase.from('jobs').update({ status: 'done', error: null }).eq('id', job.id);
    await notifyWebhook(job.restaurant_id);

    console.log(`Job ${job.id} listo: dish_assets creado para el plato ${job.dish_id}.`);
  } catch (error) {
    // El código va primero y entre corchetes a propósito: es lo primero
    // que se ve al mirar `jobs.error` en el panel o los logs, y con eso
    // ya se sabe en qué paso del pipeline pasó sin tener que leer el
    // mensaje completo.
    const { code, message } = describeError(error);
    const logMessage = `[${code}] ${message}`;
    console.error(`Job ${job.id} falló (intento ${job.attempts}/${MAX_ATTEMPTS}): ${logMessage}`);

    const retry = shouldRetry(job.attempts);
    const nextStatus = retry ? 'queued' : 'failed';

    if (retry) {
      await new Promise((resolve) => setTimeout(resolve, computeBackoffMs(job.attempts)));
    }

    await supabase.from('jobs').update({ status: nextStatus, error: logMessage }).eq('id', job.id);
  }
}

async function loop(): Promise<void> {
  console.log(`Worker iniciado. Generador: ${generator.name}.`);

  for (;;) {
    const job = await claimNextJob();

    if (job) {
      await processJob(job);
    } else {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  }
}

loop().catch((error) => {
  console.error('El worker se detuvo por un error fatal:', error);
  process.exit(1);
});
