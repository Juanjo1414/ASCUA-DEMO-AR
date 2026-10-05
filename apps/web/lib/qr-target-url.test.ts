import { describe, expect, it } from 'vitest';
import { buildQrTargetUrl } from './qr-target-url';

describe('buildQrTargetUrl', () => {
  it('arma la URL del enlace corto /r/{short_id}, no /m/[slug]', () => {
    expect(buildQrTargetUrl('https://menu-ar.app', 'ABC234')).toBe(
      'https://menu-ar.app/r/ABC234'
    );
  });

  it('funciona igual partiendo de una URL con path (request.url típico)', () => {
    expect(buildQrTargetUrl('https://menu-ar.app/api/qr?format=png', 'ABC234')).toBe(
      'https://menu-ar.app/r/ABC234'
    );
  });
});
