import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@menu-ar/db';
import {
  slugify,
  generateShortId,
  generateUniqueSlug,
  generateUniqueShortId,
  SHORT_ID_ALPHABET,
} from './restaurant-slug';

function makeFakeSupabase(taken: {
  slugs?: string[];
  shortIds?: string[];
}): SupabaseClient<Database> {
  return {
    from: () => ({
      select: () => ({
        eq: (column: string, value: string) => ({
          maybeSingle: async () => {
            const isTaken =
              (column === 'slug' && taken.slugs?.includes(value)) ||
              (column === 'short_id' && taken.shortIds?.includes(value));
            return { data: isTaken ? { id: 'existing-id' } : null };
          },
        }),
      }),
    }),
  } as unknown as SupabaseClient<Database>;
}

function makeAlwaysTakenSupabase(): SupabaseClient<Database> {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { id: 'existing-id' } }),
        }),
      }),
    }),
  } as unknown as SupabaseClient<Database>;
}

describe('slugify', () => {
  it('pasa a minúsculas y separa palabras con guiones', () => {
    expect(slugify('La Fonda Envigado')).toBe('la-fonda-envigado');
  });

  it('quita acentos y eñes se mantienen como n (por NFD + strip diacríticos)', () => {
    expect(slugify('El Ñapo Asado')).toBe('el-napo-asado');
    expect(slugify('Café Águila')).toBe('cafe-aguila');
  });

  it('colapsa espacios y símbolos repetidos en un solo guion', () => {
    expect(slugify('Donde   José & Cía.')).toBe('donde-jose-cia');
  });

  it('no deja guiones al principio ni al final', () => {
    expect(slugify('  ¡Qué Rico!  ')).toBe('que-rico');
  });
});

describe('generateShortId', () => {
  it('genera 6 caracteres', () => {
    expect(generateShortId()).toHaveLength(6);
  });

  it('solo usa el alfabeto sin caracteres ambiguos (sin 0/O/1/l/I)', () => {
    const id = generateShortId();
    for (const char of id) {
      expect(SHORT_ID_ALPHABET).toContain(char);
    }
    expect(id).not.toMatch(/[0O1lI]/);
  });

  it('genera valores distintos entre llamadas (no es un valor fijo)', () => {
    const ids = new Set(Array.from({ length: 20 }, () => generateShortId()));
    expect(ids.size).toBeGreaterThan(1);
  });
});

describe('generateUniqueSlug', () => {
  it('usa el slug base si no está tomado', async () => {
    const supabase = makeFakeSupabase({});
    await expect(generateUniqueSlug(supabase, 'La Fonda')).resolves.toBe('la-fonda');
  });

  it('agrega un sufijo numérico si el slug base ya existe', async () => {
    const supabase = makeFakeSupabase({ slugs: ['la-fonda'] });
    await expect(generateUniqueSlug(supabase, 'La Fonda')).resolves.toBe('la-fonda-2');
  });

  it('sigue incrementando el sufijo hasta encontrar uno libre', async () => {
    const supabase = makeFakeSupabase({ slugs: ['la-fonda', 'la-fonda-2', 'la-fonda-3'] });
    await expect(generateUniqueSlug(supabase, 'La Fonda')).resolves.toBe('la-fonda-4');
  });

  it('lanza un error identificable si se agotan los intentos', async () => {
    const supabase = makeFakeSupabase({
      slugs: ['restaurante', 'restaurante-2', 'restaurante-3', 'restaurante-4'],
    });
    await expect(generateUniqueSlug(supabase, '', 4)).rejects.toThrow(
      'WEB_REGISTRO_SLUG_EXHAUSTED'
    );
  });
});

describe('generateUniqueShortId', () => {
  it('devuelve un short_id de 6 caracteres si no está tomado', async () => {
    const supabase = makeFakeSupabase({});
    await expect(generateUniqueShortId(supabase)).resolves.toHaveLength(6);
  });

  it('lanza un error identificable si todos los intentos chocan', async () => {
    const supabase = makeAlwaysTakenSupabase();
    await expect(generateUniqueShortId(supabase, 3)).rejects.toThrow(
      'WEB_REGISTRO_SHORT_ID_EXHAUSTED'
    );
  });
});
