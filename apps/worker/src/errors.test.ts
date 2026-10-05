import { describe, expect, it } from 'vitest';
import { WorkerError, describeError } from './errors.js';

describe('WorkerError', () => {
  it('expone el código además del mensaje', () => {
    const error = new WorkerError('GEN_TRIPOSR_MISSING_ENDPOINT', 'Falta TRIPOSR_ENDPOINT.');
    expect(error.code).toBe('GEN_TRIPOSR_MISSING_ENDPOINT');
    expect(error.message).toBe('Falta TRIPOSR_ENDPOINT.');
    expect(error.name).toBe('WorkerError');
  });

  it('conserva la causa original cuando se le pasa', () => {
    const cause = new Error('ECONNRESET');
    const error = new WorkerError('PIPELINE_OPTIMIZE_GLTF_TRANSFORM_FAILED', 'falló', { cause });
    expect(error.cause).toBe(cause);
  });
});

describe('describeError', () => {
  it('devuelve el código real para un WorkerError', () => {
    const error = new WorkerError('GEN_MESHY_POLL_TIMEOUT', 'timeout');
    expect(describeError(error)).toEqual({ code: 'GEN_MESHY_POLL_TIMEOUT', message: 'timeout' });
  });

  it('devuelve WORKER_UNKNOWN_ERROR para un Error genérico (subproceso, fetch, etc.)', () => {
    expect(describeError(new Error('algo raro'))).toEqual({
      code: 'WORKER_UNKNOWN_ERROR',
      message: 'algo raro',
    });
  });

  it('devuelve WORKER_UNKNOWN_ERROR para algo que ni siquiera es un Error', () => {
    expect(describeError('un string cualquiera')).toEqual({
      code: 'WORKER_UNKNOWN_ERROR',
      message: 'un string cualquiera',
    });
  });
});
