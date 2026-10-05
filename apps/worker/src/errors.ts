// Cada error del worker lleva un código fijo que identifica en qué paso
// del pipeline pasó (generador, optimización, USDZ, poster, subida,
// loop principal), independiente del mensaje. El texto de `error.message`
// puede cambiar (viene de una API externa, de un subproceso, etc.); el
// código no. Es lo que queda grabado en `jobs.error` y en los logs.
export class WorkerError extends Error {
  readonly code: string;

  constructor(code: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'WorkerError';
    this.code = code;
  }
}

export function describeError(error: unknown): { code: string; message: string } {
  if (error instanceof WorkerError) {
    return { code: error.code, message: error.message };
  }
  if (error instanceof Error) {
    return { code: 'WORKER_UNKNOWN_ERROR', message: error.message };
  }
  return { code: 'WORKER_UNKNOWN_ERROR', message: String(error) };
}
