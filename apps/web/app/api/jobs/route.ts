import { NextResponse, type NextRequest } from 'next/server';
import { createServerSessionClient } from '@/lib/supabase/server-session-client';

interface CreateJobBody {
  dishId?: string;
  sourcePhoto?: string;
}

// Encola la generación 3D (Fase 4 → Fase 5). Usa el cliente con sesión,
// no service role: RLS ("owner dishes"/"owner jobs") ya garantiza que
// nadie encole un job sobre un plato que no es suyo.
// Modo demo: la UI ya esconde la captura, pero ocultar un botón no es un
// control. Sin worker corriendo, un POST directo dejaría el job en 'queued'
// para siempre, así que se rechaza acá también.
export async function POST(request: NextRequest) {
  if (process.env.NEXT_PUBLIC_DEMO_MODE === 'true') {
    return NextResponse.json(
      { error: 'Generación no disponible en la demostración', code: 'API_JOBS_DEMO_MODE' },
      { status: 503 }
    );
  }

  const supabase = await createServerSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: 'No autenticado', code: 'API_JOBS_UNAUTHENTICATED' },
      { status: 401 }
    );
  }

  const { dishId, sourcePhoto } = (await request.json()) as CreateJobBody;

  if (!dishId || !sourcePhoto) {
    return NextResponse.json(
      { error: 'Faltan dishId o sourcePhoto', code: 'API_JOBS_MISSING_FIELDS' },
      { status: 400 }
    );
  }

  // CN-002: el worker hace fetch(sourcePhoto) con credenciales de service
  // role. Sin este chequeo, cualquier usuario auto-registrado podría
  // apuntar ese fetch a una dirección interna (SSRF) en vez de a una foto
  // real del bucket. Solo se acepta una URL pública del propio bucket
  // dish-photos de este proyecto de Supabase.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const expectedPrefix = `${supabaseUrl}/storage/v1/object/public/dish-photos/`;
  if (!supabaseUrl || !sourcePhoto.startsWith(expectedPrefix)) {
    return NextResponse.json(
      { error: 'sourcePhoto inválida', code: 'API_JOBS_INVALID_SOURCE' },
      { status: 400 }
    );
  }

  const { data: dish } = await supabase
    .from('dishes')
    .select('id, restaurant_id')
    .eq('id', dishId)
    .single();

  if (!dish) {
    return NextResponse.json(
      { error: 'Plato no encontrado', code: 'API_JOBS_DISH_NOT_FOUND' },
      { status: 404 }
    );
  }

  const { data: job, error } = await supabase
    .from('jobs')
    .insert({
      restaurant_id: dish.restaurant_id,
      dish_id: dish.id,
      source_photo: sourcePhoto,
      status: 'queued',
    })
    .select()
    .single();

  if (error || !job) {
    console.error('[API_JOBS_INSERT_FAILED]', error);
    return NextResponse.json(
      { error: 'No se pudo encolar el job', code: 'API_JOBS_INSERT_FAILED' },
      { status: 500 }
    );
  }

  return NextResponse.json({ job }, { status: 201 });
}
