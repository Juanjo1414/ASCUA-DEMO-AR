import { describe, expect, it, vi } from 'vitest';
import { logError } from './errors';

describe('logError', () => {
  it('loguea con el código entre corchetes delante del error', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const error = new Error('boom');

    logError('ADMIN_DISH_SAVE_FAILED', error);

    expect(spy).toHaveBeenCalledWith('[ADMIN_DISH_SAVE_FAILED]', error);
    spy.mockRestore();
  });
});
