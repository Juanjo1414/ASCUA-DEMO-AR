import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Test "global": análisis estático de texto sobre los .sql, sin base de
// datos real. No reemplaza probar contra un Supabase de verdad, pero
// atrapa la clase de bug que ya nos pasó una vez (ver Fase 4): una tabla
// con RLS activado y ninguna política, que en Postgres significa "nadie
// puede tocar esto ni con la anon key ni con una sesión válida".

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, 'migrations');

function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.sql'))
    .sort(); // el prefijo 0001_, 0002_... ordena bien alfabéticamente
}

function readAllMigrations(): string {
  return migrationFiles()
    .map((file) => readFileSync(join(MIGRATIONS_DIR, file), 'utf-8'))
    .join('\n');
}

describe('migraciones SQL', () => {
  it('toda tabla con RLS activado tiene al menos una política, sumando todas las migraciones', () => {
    const sql = readAllMigrations();

    const tablesWithRlsEnabled = [
      ...sql.matchAll(/alter table (\w+) enable row level security/gi),
    ].map((match) => match[1]);

    // Si esto da 0, seguramente el regex se desincronizó del SQL real,
    // no que dejamos de tener RLS en algún lado.
    expect(tablesWithRlsEnabled.length).toBeGreaterThan(0);

    const tablesWithPolicies = new Set(
      [...sql.matchAll(/create policy\s+"[^"]+"\s+on\s+(\w+)/gi)].map((match) => match[1])
    );

    const tablesWithoutPolicy = tablesWithRlsEnabled.filter(
      (table) => !tablesWithPolicies.has(table)
    );

    expect(tablesWithoutPolicy).toEqual([]);
  });

  it('las migraciones están numeradas en secuencia, sin huecos ni duplicados', () => {
    const files = migrationFiles();

    const numbers = files
      .map((file) => file.match(/^(\d+)_/)?.[1])
      .filter((value): value is string => Boolean(value))
      .map(Number)
      .sort((a, b) => a - b);

    expect(numbers).toEqual(files.map((_, index) => index + 1));
  });
});
