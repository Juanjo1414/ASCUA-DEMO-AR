import { describe, expect, it, vi } from 'vitest';

// vi.mock se hoistea sobre todo el archivo, incluida cualquier `const` de
// más arriba — sin vi.hoisted(), lookupMock todavía sería TDZ cuando la
// factory corre.
const { lookupMock } = vi.hoisted(() => ({ lookupMock: vi.fn() }));
vi.mock('node:dns/promises', () => ({ lookup: lookupMock, default: { lookup: lookupMock } }));

import { assertPublicHttpUrl } from './ssrf-guard.js';
import { WorkerError } from './errors.js';

// CN-002 (segunda capa): stripExifAndReupload en index.ts llama a esto
// antes de fetch(photoUrl) con credenciales de service role. Estos casos
// cubren lo que debería bloquear aunque la validación de la API falle o
// se salte.
describe('assertPublicHttpUrl', () => {
  it('rechaza esquemas que no son http/https', async () => {
    await expect(assertPublicHttpUrl('javascript:alert(1)')).rejects.toThrow(WorkerError);
  });

  it('rechaza URLs con sintaxis inválida', async () => {
    await expect(assertPublicHttpUrl('no es una url')).rejects.toThrow(WorkerError);
  });

  it('rechaza localhost', async () => {
    await expect(assertPublicHttpUrl('http://localhost/x')).rejects.toThrow(WorkerError);
  });

  it('rechaza direcciones IP privadas, loopback y link-local literales', async () => {
    await expect(assertPublicHttpUrl('http://127.0.0.1/x')).rejects.toThrow(WorkerError);
    await expect(assertPublicHttpUrl('http://169.254.169.254/latest/meta-data/')).rejects.toThrow(
      WorkerError
    ); // metadata de nube
    await expect(assertPublicHttpUrl('http://10.0.0.5/x')).rejects.toThrow(WorkerError);
  });

  it('acepta una IP pública literal sin lanzar', async () => {
    await expect(assertPublicHttpUrl('https://8.8.8.8/x')).resolves.toBeUndefined();
  });

  it('rechaza un hostname que resuelve a una IP privada', async () => {
    lookupMock.mockResolvedValue([{ address: '10.0.0.1', family: 4 }]);

    await expect(assertPublicHttpUrl('https://malicioso.example/x')).rejects.toThrow(WorkerError);
  });

  it('acepta un hostname que resuelve a una IP pública', async () => {
    lookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);

    await expect(assertPublicHttpUrl('https://ejemplo.com/x')).resolves.toBeUndefined();
  });
});
