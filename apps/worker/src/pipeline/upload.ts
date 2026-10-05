import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@menu-ar/db';
import { WorkerError } from '../errors.js';

const BUCKET = 'dish-assets';

function hashName(buffer: Buffer, extension: string): string {
  const hash = createHash('sha256').update(buffer).digest('hex').slice(0, 16);
  return `${hash}.${extension}`;
}

export interface UploadedAssets {
  glbUrl: string;
  usdzUrl: string | null;
  posterUrl: string;
  bytesGlb: number;
}

// Nombre hasheado + Cache-Control immutable (sección 1 y 7 del plan): un
// modelo publicado nunca cambia de contenido bajo la misma URL, así que
// nunca se re-descarga.
export async function uploadAssets(
  supabase: SupabaseClient<Database>,
  dishId: string,
  files: { glb: Buffer; usdz: Buffer | null; poster: Buffer }
): Promise<UploadedAssets> {
  const items: Array<{ key: 'glb' | 'usdz' | 'poster'; buffer: Buffer; fileName: string; contentType: string }> = [
    { key: 'glb', buffer: files.glb, fileName: hashName(files.glb, 'glb'), contentType: 'model/gltf-binary' },
    { key: 'poster', buffer: files.poster, fileName: hashName(files.poster, 'webp'), contentType: 'image/webp' },
  ];
  if (files.usdz) {
    items.push({ key: 'usdz', buffer: files.usdz, fileName: hashName(files.usdz, 'usdz'), contentType: 'model/vnd.usdz+zip' });
  }

  const urls: Record<'glb' | 'usdz' | 'poster', string | null> = { glb: null, usdz: null, poster: null };

  for (const { key, buffer, fileName, contentType } of items) {
    const path = `${dishId}/${fileName}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, buffer, {
      contentType,
      cacheControl: '31536000', // 1 año
      upsert: false,
    });

    if (error) {
      throw new WorkerError(
        `PIPELINE_UPLOAD_${key.toUpperCase()}_FAILED`,
        `No se pudo subir ${key}: ${error.message}`
      );
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from(BUCKET).getPublicUrl(path);
    urls[key] = publicUrl;
  }

  return {
    glbUrl: urls.glb as string,
    usdzUrl: urls.usdz,
    posterUrl: urls.poster as string,
    bytesGlb: files.glb.byteLength,
  };
}
