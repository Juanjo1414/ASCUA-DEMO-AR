import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';

const createUserMock = vi.fn();
const signInWithOtpMock = vi.fn();
const restaurantInsertSingleMock = vi.fn();
const categoryInsertSingleMock = vi.fn();
const dishesInsertMock = vi.fn();

vi.mock('@/lib/supabase/server-client', () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      admin: { createUser: createUserMock },
      signInWithOtp: signInWithOtpMock,
    },
    from: (table: string) => {
      if (table === 'restaurants') {
        return { insert: () => ({ select: () => ({ single: restaurantInsertSingleMock }) }) };
      }
      if (table === 'categories') {
        return { insert: () => ({ select: () => ({ single: categoryInsertSingleMock }) }) };
      }
      if (table === 'dishes') {
        return { insert: dishesInsertMock };
      }
      throw new Error(`Tabla inesperada en el mock: ${table}`);
    },
  })),
}));

// generateUniqueSlug/generateUniqueShortId ya tienen sus propios tests en
// restaurant-slug.test.ts (colisiones, sufijos, etc.); acá alcanza con un
// valor fijo para no tener que simular esos selects también.
vi.mock('@/lib/restaurant-slug', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/restaurant-slug')>();
  return {
    ...actual,
    generateUniqueSlug: vi.fn(async () => 'la-fonda'),
    generateUniqueShortId: vi.fn(async () => 'ABC234'),
  };
});

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/registro', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

const validBody = {
  name: 'La Fonda',
  email: 'dueno@example.com',
  cuisine: 'otra',
  termsAccepted: true,
};

describe('POST /api/registro', () => {
  beforeEach(() => {
    createUserMock.mockReset();
    signInWithOtpMock.mockReset().mockResolvedValue({ error: null });
    restaurantInsertSingleMock.mockReset();
    categoryInsertSingleMock.mockReset();
    dishesInsertMock.mockReset().mockResolvedValue({ error: null });
  });

  it('responde 400 si faltan campos obligatorios', async () => {
    const response = await POST(makeRequest({ name: 'La Fonda' }));
    expect(response.status).toBe(400);
  });

  it('responde 400 si el tipo de cocina no existe', async () => {
    const response = await POST(makeRequest({ ...validBody, cuisine: 'coreana' }));
    expect(response.status).toBe(400);
  });

  it('responde 409 si el correo ya tiene cuenta', async () => {
    createUserMock.mockResolvedValue({
      data: { user: null },
      error: { message: 'User already registered' },
    });

    const response = await POST(makeRequest(validBody));
    expect(response.status).toBe(409);
  });

  it('responde 500 si falla la creación del usuario por otra razón', async () => {
    createUserMock.mockResolvedValue({
      data: { user: null },
      error: { message: 'Internal error' },
    });

    const response = await POST(makeRequest(validBody));
    expect(response.status).toBe(500);
  });

  it('crea el restaurante y responde 201 (plantilla "otra", sin categorías)', async () => {
    createUserMock.mockResolvedValue({ data: { user: { id: 'owner-1' } }, error: null });
    restaurantInsertSingleMock.mockResolvedValue({
      data: { id: 'restaurant-1', slug: 'la-fonda', short_id: 'ABC234' },
      error: null,
    });

    const response = await POST(makeRequest(validBody));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.restaurant.id).toBe('restaurant-1');
    expect(categoryInsertSingleMock).not.toHaveBeenCalled();
    // El enlace tiene que aterrizar en /auth/callback: es el único que
    // canjea el código por sesión. Sin eso el dueño abre el correo y
    // termina de vuelta en la pantalla de login.
    expect(signInWithOtpMock).toHaveBeenCalledWith({
      email: validBody.email,
      options: { emailRedirectTo: 'http://localhost/auth/callback?next=/admin/mi-restaurante' },
    });
  });

  it('siembra categorías y platos cuando la plantilla los trae (cocina mexicana)', async () => {
    createUserMock.mockResolvedValue({ data: { user: { id: 'owner-1' } }, error: null });
    restaurantInsertSingleMock.mockResolvedValue({
      data: { id: 'restaurant-1', slug: 'la-fonda', short_id: 'ABC234' },
      error: null,
    });
    categoryInsertSingleMock.mockResolvedValue({
      data: { id: 'category-1' },
      error: null,
    });

    const response = await POST(makeRequest({ ...validBody, cuisine: 'mexicana' }));

    expect(response.status).toBe(201);
    // La plantilla mexicana trae 2 categorías (Entradas, Platos fuertes).
    expect(categoryInsertSingleMock).toHaveBeenCalledTimes(2);
    expect(dishesInsertMock).toHaveBeenCalledTimes(2);
  });

  it('sigue respondiendo 201 aunque falle el envío del magic link', async () => {
    createUserMock.mockResolvedValue({ data: { user: { id: 'owner-1' } }, error: null });
    restaurantInsertSingleMock.mockResolvedValue({
      data: { id: 'restaurant-1', slug: 'la-fonda', short_id: 'ABC234' },
      error: null,
    });
    signInWithOtpMock.mockResolvedValue({ error: { message: 'rate limited' } });

    const response = await POST(makeRequest(validBody));
    expect(response.status).toBe(201);
  });
});
