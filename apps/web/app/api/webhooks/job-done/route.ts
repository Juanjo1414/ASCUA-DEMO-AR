import { timingSafeEqual, createHash } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { revalidateMenuByRestaurantId } from '@/lib/revalidate-menu';

interface JobDoneBody {
  restaurantId?: string;
}

// CN-016: comparar el secreto con `!==` filtra por timing cuántos
// caracteres iniciales coinciden. Hashear ambos lados a un largo fijo
// antes de compararlos con timingSafeEqual evita eso (además de esquivar
// el requisito de timingSafeEqual de que los buffers tengan el mismo
// largo, que un secreto de largo variable no garantiza por sí solo).
function secretsMatch(received: string, expected: string): boolean {
  const receivedHash = createHash('sha256').update(received).digest();
  const expectedHash = createHash('sha256').update(expected).digest();
  return timingSafeEqual(receivedHash, expectedHash);
}

// Paso 9 del flujo del worker (Fase 5): al terminar un job se refresca el
// menú público para que el modelo nuevo no espere a la próxima
// revalidación de ISR (1 hora, Fase 2).
export async function POST(request: NextRequest) {
  const secret = request.headers.get('x-revalidate-secret');
  if (!process.env.REVALIDATE_SECRET || !secret || !secretsMatch(secret, process.env.REVALIDATE_SECRET)) {
    return NextResponse.json(
      { error: 'No autorizado', code: 'API_WEBHOOK_JOB_DONE_UNAUTHORIZED' },
      { status: 401 }
    );
  }

  const { restaurantId } = (await request.json()) as JobDoneBody;

  if (!restaurantId) {
    return NextResponse.json(
      { error: 'Falta restaurantId', code: 'API_WEBHOOK_JOB_DONE_MISSING_RESTAURANT_ID' },
      { status: 400 }
    );
  }

  const revalidated = await revalidateMenuByRestaurantId(restaurantId);

  if (!revalidated) {
    return NextResponse.json(
      { error: 'Restaurante no encontrado', code: 'API_WEBHOOK_JOB_DONE_RESTAURANT_NOT_FOUND' },
      { status: 404 }
    );
  }

  return NextResponse.json({ revalidated: true });
}
