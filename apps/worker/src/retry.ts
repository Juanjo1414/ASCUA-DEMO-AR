export const MAX_ATTEMPTS = 3;

// Extraído de index.ts para poder testear la política de reintentos
// (sección "Fase 5" del plan: "backoff exponencial, máximo 3") sin correr
// el pipeline completo de generación 3D.
export function shouldRetry(attempts: number, maxAttempts: number = MAX_ATTEMPTS): boolean {
  return attempts < maxAttempts;
}

export function computeBackoffMs(attempts: number): number {
  return 2 ** attempts * 1000;
}
