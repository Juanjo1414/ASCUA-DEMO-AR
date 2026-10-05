// Mismo criterio que apps/worker/src/errors.ts, versión liviana para
// apps/web: acá casi todo se resuelve como estado de UI ("no se pudo
// guardar"), no como una excepción que sube hasta un error boundary. Lo
// que hacía falta era un lugar fijo donde loguear con un código
// identificable, en vez de tragarse el error de Supabase en silencio.
export function logError(code: string, error: unknown): void {
  console.error(`[${code}]`, error);
}
