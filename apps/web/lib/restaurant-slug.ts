import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@menu-ar/db';

// slugify/generateShortId: extraídos de RestaurantSettingsForm.tsx para
// poder testearlos sin montar el componente.
// generateUniqueSlug/generateUniqueShortId (Fase 6): la versión con
// desambiguación real contra la base de datos que usa /registro.
export const SHORT_ID_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'; // sin 0/O/1/l/I

export function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '') // quita los acentos que separó NFD
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export function generateShortId(): string {
  let id = '';
  for (let i = 0; i < 6; i += 1) {
    id += SHORT_ID_ALPHABET[Math.floor(Math.random() * SHORT_ID_ALPHABET.length)];
  }
  return id;
}

// "Genera slug (con desambiguación si choca)" — sección Fase 6 del plan.
// La-fonda, la-fonda-2, la-fonda-3... antes que fallar el registro por un
// choque de nombre.
export async function generateUniqueSlug(
  supabase: SupabaseClient<Database>,
  name: string,
  maxAttempts = 50
): Promise<string> {
  const base = slugify(name) || 'restaurante';

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
    const { data } = await supabase
      .from('restaurants')
      .select('id')
      .eq('slug', candidate)
      .maybeSingle();

    if (!data) return candidate;
  }

  throw new Error(
    `[WEB_REGISTRO_SLUG_EXHAUSTED] No se pudo generar un slug único para "${name}" en ${maxAttempts} intentos.`
  );
}

export async function generateUniqueShortId(
  supabase: SupabaseClient<Database>,
  maxAttempts = 10
): Promise<string> {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const candidate = generateShortId();
    const { data } = await supabase
      .from('restaurants')
      .select('id')
      .eq('short_id', candidate)
      .maybeSingle();

    if (!data) return candidate;
  }

  throw new Error(
    `[WEB_REGISTRO_SHORT_ID_EXHAUSTED] No se pudo generar un short_id único en ${maxAttempts} intentos.`
  );
}
