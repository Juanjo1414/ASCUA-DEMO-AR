import { describe, expect, it } from 'vitest';
import { shouldRetry, computeBackoffMs, MAX_ATTEMPTS } from './retry.js';

describe('shouldRetry', () => {
  it('reintenta mientras no se alcance el máximo de intentos', () => {
    expect(shouldRetry(1, 3)).toBe(true);
    expect(shouldRetry(2, 3)).toBe(true);
  });

  it('deja de reintentar al llegar o pasar el máximo', () => {
    expect(shouldRetry(3, 3)).toBe(false);
    expect(shouldRetry(4, 3)).toBe(false);
  });

  it('usa MAX_ATTEMPTS=3 por default, tal como pide el plan ("máximo 3")', () => {
    expect(MAX_ATTEMPTS).toBe(3);
    expect(shouldRetry(2)).toBe(true);
    expect(shouldRetry(3)).toBe(false);
  });
});

describe('computeBackoffMs', () => {
  it('crece exponencialmente en base a los intentos (2^intentos segundos)', () => {
    expect(computeBackoffMs(0)).toBe(1000);
    expect(computeBackoffMs(1)).toBe(2000);
    expect(computeBackoffMs(2)).toBe(4000);
    expect(computeBackoffMs(3)).toBe(8000);
  });
});
