import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';

const getUserMock = vi.fn();
const dishSingleMock = vi.fn();
const jobInsertSingleMock = vi.fn();

// Reemplaza el cliente de sesión real por uno que solo sabe responder
// las dos consultas exactas que hace route.ts, para poder probar la
// lógica de la ruta (401/400/404/201) sin un Supabase de verdad.
// vi.mock() se hoistea sobre los imports de arriba, así que route.ts ya
// recibe esta versión mockeada cuando se importa.
vi.mock('@/lib/supabase/server-session-client', () => ({
  createServerSessionClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
    from: (table: string) => {
      if (table === 'dishes') {
        return { select: () => ({ eq: () => ({ single: dishSingleMock }) }) };
      }
      if (table === 'jobs') {
        return { insert: () => ({ select: () => ({ single: jobInsertSingleMock }) }) };
      }
      throw new Error(`Tabla inesperada en el mock: ${table}`);
    },
  })),
}));

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/jobs', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

// CN-002: sourcePhoto ahora tiene que empezar con la URL pública del
// bucket dish-photos de este proyecto de Supabase — cualquier otra cosa
// se rechaza con 400 antes de tocar la base de datos.
const VALID_SOURCE_PHOTO = 'https://test.supabase.co/storage/v1/object/public/dish-photos/d1/source.jpg';

describe('POST /api/jobs', () => {
  beforeEach(() => {
    getUserMock.mockReset();
    dishSingleMock.mockReset();
    jobInsertSingleMock.mockReset();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
  });

  it('responde 401 si no hay sesión', async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });

    const response = await POST(makeRequest({ dishId: 'd1', sourcePhoto: VALID_SOURCE_PHOTO }));

    expect(response.status).toBe(401);
  });

  it('responde 400 si falta dishId o sourcePhoto', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'owner-1' } } });

    const response = await POST(makeRequest({ dishId: 'd1' }));

    expect(response.status).toBe(400);
  });

  it('responde 400 si sourcePhoto no es del bucket dish-photos (SSRF)', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'owner-1' } } });

    const response = await POST(
      makeRequest({ dishId: 'd1', sourcePhoto: 'http://169.254.169.254/latest/meta-data/' })
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe('API_JOBS_INVALID_SOURCE');
    expect(dishSingleMock).not.toHaveBeenCalled();
  });

  it('responde 404 si el plato no existe o no es del dueño (RLS ya lo filtró)', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'owner-1' } } });
    dishSingleMock.mockResolvedValue({ data: null });

    const response = await POST(makeRequest({ dishId: 'd1', sourcePhoto: VALID_SOURCE_PHOTO }));

    expect(response.status).toBe(404);
  });

  it('encola el job y responde 201 con el job creado', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'owner-1' } } });
    dishSingleMock.mockResolvedValue({ data: { id: 'd1', restaurant_id: 'r1' } });
    jobInsertSingleMock.mockResolvedValue({
      data: { id: 'job-1', status: 'queued', dish_id: 'd1', restaurant_id: 'r1' },
      error: null,
    });

    const response = await POST(makeRequest({ dishId: 'd1', sourcePhoto: VALID_SOURCE_PHOTO }));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.job.status).toBe('queued');
  });

  it('responde 500 si Supabase devuelve error al insertar el job', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'owner-1' } } });
    dishSingleMock.mockResolvedValue({ data: { id: 'd1', restaurant_id: 'r1' } });
    jobInsertSingleMock.mockResolvedValue({ data: null, error: { message: 'boom' } });

    const response = await POST(makeRequest({ dishId: 'd1', sourcePhoto: VALID_SOURCE_PHOTO }));

    expect(response.status).toBe(500);
  });
});
