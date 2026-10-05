import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';

const getUserMock = vi.fn();
const restaurantMaybeSingleMock = vi.fn();

vi.mock('@/lib/supabase/server-session-client', () => ({
  createServerSessionClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: restaurantMaybeSingleMock }) }) }),
  })),
}));

function makeRequest(format?: string): NextRequest {
  const url = format ? `http://localhost/api/qr?format=${format}` : 'http://localhost/api/qr';
  return new NextRequest(url);
}

// La generación real de PNG/SVG/PDF (qrcode, sharp, pdf-lib trabajando de
// verdad) no está cubierta acá: solo el guard de sesión/restaurante,
// que es la parte con lógica propia. El resto es orquestar librerías.
describe('GET /api/qr', () => {
  beforeEach(() => {
    getUserMock.mockReset();
    restaurantMaybeSingleMock.mockReset();
  });

  it('responde 401 si no hay sesión', async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });

    const response = await GET(makeRequest());

    expect(response.status).toBe(401);
  });

  it('responde 404 si el dueño todavía no tiene restaurante', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'owner-1' } } });
    restaurantMaybeSingleMock.mockResolvedValue({ data: null });

    const response = await GET(makeRequest());

    expect(response.status).toBe(404);
  });
});
