import { describe, expect, it, vi } from 'vitest';

// vi.mock se hoistea sobre todo el archivo, incluida cualquier `const` de
// más arriba — sin vi.hoisted(), lookupMock todavía sería TDZ cuando la
// factory corre.
const { lookupMock } = vi.hoisted(() => ({ lookupMock: vi.fn() }));
vi.mock('node:dns/promises', () => ({ lookup: lookupMock, default: { lookup: lookupMock } }));

import { isPublicHttpUrl } from './ssrf-guard';

// CN-005: GET /api/qr hace fetch(logo_url) server-side. Estos casos
// cubren lo que un dueño auto-registrado podría meter en ese campo para
// convertir el endpoint en una sonda SSRF contra la red interna.
describe('isPublicHttpUrl', () => {
  it('rechaza esquemas que no son http/https', async () => {
    expect(await isPublicHttpUrl('javascript:alert(1)')).toBe(false);
    expect(await isPublicHttpUrl('ftp://example.com/file')).toBe(false);
  });

  it('rechaza URLs con sintaxis inválida', async () => {
    expect(await isPublicHttpUrl('no es una url')).toBe(false);
  });

  it('rechaza localhost', async () => {
    expect(await isPublicHttpUrl('http://localhost/x')).toBe(false);
  });

  it('rechaza direcciones IP privadas, loopback y link-local literales', async () => {
    expect(await isPublicHttpUrl('http://127.0.0.1/x')).toBe(false);
    expect(await isPublicHttpUrl('http://169.254.169.254/latest/meta-data/')).toBe(false); // metadata de nube
    expect(await isPublicHttpUrl('http://10.0.0.5/x')).toBe(false);
    expect(await isPublicHttpUrl('http://192.168.1.1/x')).toBe(false);
  });

  it('acepta una IP pública literal', async () => {
    expect(await isPublicHttpUrl('https://8.8.8.8/x')).toBe(true);
  });

  it('rechaza un hostname que resuelve a una IP privada', async () => {
    lookupMock.mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);

    expect(await isPublicHttpUrl('https://malicioso.example/x')).toBe(false);
  });

  it('acepta un hostname que resuelve a una IP pública', async () => {
    lookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);

    expect(await isPublicHttpUrl('https://ejemplo.com/x')).toBe(true);
  });
});
