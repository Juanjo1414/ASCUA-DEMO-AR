import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';

// vi.hoisted sube estas variables junto con los vi.mock de abajo: sin eso,
// el factory del mock se evalua antes de que existan.
type TraduccionPrevia = { dish_id: string; updated_at: string; editada_a_mano: boolean };

const { getUserMock, restaurantMock, traducirTextosMock, upsertPlatosMock, traduccionesPrevias } =
  vi.hoisted(() => ({
    getUserMock: vi.fn(),
    restaurantMock: vi.fn(),
    traducirTextosMock: vi.fn(),
    upsertPlatosMock: vi.fn(),
    // Tipado explícito: con `data: []` TypeScript infiere never[] y los casos
    // que devuelven filas no compilan, aunque en ejecución pasen.
    traduccionesPrevias: vi.fn((): { data: TraduccionPrevia[] } => ({ data: [] })),
  }));

// Igual que en api/jobs: se reemplaza el cliente de sesión por uno que sólo
// sabe responder las consultas exactas que hace la ruta, para probar sus
// reglas —plan, idioma base, traducciones a mano— sin un Supabase real.
vi.mock('@/lib/supabase/server-session-client', () => ({
  createServerSessionClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
    from: (table: string) => {
      if (table === 'restaurants') {
        return { select: () => ({ eq: () => ({ maybeSingle: restaurantMock }) }) };
      }
      if (table === 'dishes') {
        return {
          select: () => ({
            eq: async () => ({
              data: [
                {
                  id: 'd1',
                  name: 'Lubina a la plancha',
                  description: 'Con puré',
                  updated_at: '2026-01-01T00:00:00Z',
                },
              ],
            }),
          }),
        };
      }
      if (table === 'categories') {
        return {
          select: () => ({ eq: async () => ({ data: [{ id: 'c1', name: 'Fuertes' }] }) }),
        };
      }
      if (table === 'dish_translations') {
        return {
          select: () => ({ eq: async () => traduccionesPrevias() }),
          upsert: upsertPlatosMock,
        };
      }
      if (table === 'category_translations') {
        return { upsert: async () => ({ error: null }) };
      }
      throw new Error(`Tabla inesperada en el mock: ${table}`);
    },
  })),
}));

vi.mock('@/lib/deepl', async () => {
  const real = await vi.importActual<typeof import('@/lib/deepl')>('@/lib/deepl');
  return { ...real, traducirTextos: traducirTextosMock };
});

vi.mock('@/lib/revalidate-menu', () => ({ revalidateMenuBySlug: vi.fn() }));

function pedir(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/traducir', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

const CON_SESION = { data: { user: { id: 'u1' } } };

beforeEach(() => {
  vi.clearAllMocks();
  upsertPlatosMock.mockResolvedValue({ error: null });
  traducirTextosMock.mockResolvedValue(['Sea bass', 'With purée', 'Mains']);
});

describe('POST /api/traducir', () => {
  it('rechaza sin sesión', async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const res = await POST(pedir({ lang: 'en' }));
    expect(res.status).toBe(401);
  });

  it('rechaza un idioma que la carta no sabe servir', async () => {
    getUserMock.mockResolvedValue(CON_SESION);
    const res = await POST(pedir({ lang: 'klingon' }));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('API_TRADUCIR_IDIOMA_INVALIDO');
  });

  it('no gasta cuota de DeepL en un idioma que el cupo no publica', async () => {
    getUserMock.mockResolvedValue(CON_SESION);
    // Starter incluye un solo idioma adicional: el italiano queda fuera.
    restaurantMock.mockResolvedValue({
      data: {
        id: 'r1',
        slug: 'ascua',
        plan: 'starter',
        base_language: 'es',
        idiomas: ['en', 'it'],
        idiomas_extra: 0,
      },
    });

    const res = await POST(pedir({ lang: 'it' }));

    expect(res.status).toBe(403);
    expect(traducirTextosMock).not.toHaveBeenCalled();
  });

  it('rechaza traducir al mismo idioma en que está escrita la carta', async () => {
    getUserMock.mockResolvedValue(CON_SESION);
    restaurantMock.mockResolvedValue({
      data: { id: 'r1', slug: 'ascua', plan: 'business', base_language: 'es', idiomas: ['es'] },
    });

    const res = await POST(pedir({ lang: 'es' }));

    expect(res.status).toBe(400);
    expect(traducirTextosMock).not.toHaveBeenCalled();
  });

  it('traduce platos y categorías y devuelve cuántos', async () => {
    getUserMock.mockResolvedValue(CON_SESION);
    restaurantMock.mockResolvedValue({
      data: { id: 'r1', slug: 'ascua', plan: 'growth', base_language: 'es', idiomas: ['en'] },
    });

    const res = await POST(pedir({ lang: 'en' }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.traducidos).toBe(1);
    expect(body.categorias).toBe(1);
    expect(traducirTextosMock).toHaveBeenCalledWith(
      ['Lubina a la plancha', 'Con puré', 'Fuertes'],
      'en',
      'es'
    );
  });

  it('respeta el idioma base del restaurante: traduce desde inglés en Malta', async () => {
    getUserMock.mockResolvedValue(CON_SESION);
    restaurantMock.mockResolvedValue({
      data: { id: 'r1', slug: 'ascua', plan: 'business', base_language: 'en', idiomas: ['it'] },
    });

    await POST(pedir({ lang: 'it' }));

    expect(traducirTextosMock).toHaveBeenCalledWith(expect.anything(), 'it', 'en');
  });

  it('devuelve 502 si DeepL falla, sin dejar traducciones a medias', async () => {
    getUserMock.mockResolvedValue(CON_SESION);
    restaurantMock.mockResolvedValue({
      data: { id: 'r1', slug: 'ascua', plan: 'growth', base_language: 'es', idiomas: ['en'] },
    });
    const { DeepLError } = await vi.importActual<typeof import('@/lib/deepl')>('@/lib/deepl');
    traducirTextosMock.mockRejectedValue(
      new DeepLError('Se agotó la cuota', 'DEEPL_CUOTA_AGOTADA')
    );

    const res = await POST(pedir({ lang: 'en' }));

    expect(res.status).toBe(502);
    expect((await res.json()).code).toBe('DEEPL_CUOTA_AGOTADA');
    expect(upsertPlatosMock).not.toHaveBeenCalled();
  });

  it('no gasta cuota si la traduccion ya esta al dia: reactivar un idioma no retraduce',
    async () => {
      getUserMock.mockResolvedValue(CON_SESION);
      restaurantMock.mockResolvedValue({
        data: { id: 'r1', slug: 'ascua', plan: 'growth', base_language: 'es', idiomas: ['en'] },
      });
      // Traducida despues del ultimo cambio del plato.
      traduccionesPrevias.mockReturnValue({
        data: [{ dish_id: 'd1', updated_at: '2026-06-01T00:00:00Z', editada_a_mano: false }],
      });

      const res = await POST(pedir({ lang: 'en' }));
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.reutilizados).toBe(1);
      expect(traducirTextosMock).toHaveBeenCalledWith(
        ['Fuertes'],
        'en',
        'es'
      );
    });

  it('retraduce un plato que cambio despues de su ultima traduccion',
    async () => {
      getUserMock.mockResolvedValue(CON_SESION);
      restaurantMock.mockResolvedValue({
        data: { id: 'r1', slug: 'ascua', plan: 'growth', base_language: 'es', idiomas: ['en'] },
      });
      // Traducida ANTES del ultimo cambio del plato.
      traduccionesPrevias.mockReturnValue({
        data: [{ dish_id: 'd1', updated_at: '2025-01-01T00:00:00Z', editada_a_mano: false }],
      });

      await POST(pedir({ lang: 'en' }));

      expect(traducirTextosMock).toHaveBeenCalledWith(
        ['Lubina a la plancha', 'Con puré', 'Fuertes'],
        'en',
        'es'
      );
    });
});
