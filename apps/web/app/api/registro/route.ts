import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase/server-client';
import { generateUniqueSlug, generateUniqueShortId } from '@/lib/restaurant-slug';
import { MENU_TEMPLATES, isCuisineType, type MenuTemplate } from '@/lib/menu-templates';
import { TERMS_VERSION } from '@/lib/terms';

interface RegistroBody {
  name?: string;
  email?: string;
  cuisine?: string;
  termsAccepted?: boolean;
}

// /registro (Fase 6): nombre + correo + tipo de cocina, listo. Crea el
// usuario con la Admin API (sin fricción de confirmar el registro en sí,
// solo el login), el restaurante en is_published=false, siembra la
// plantilla de menú elegida y dispara el magic link para que el dueño
// entre a /admin. Usa el cliente de service role — un visitante anónimo
// no tiene sesión todavía, así que RLS no aplicaría acá de todos modos.
export async function POST(request: NextRequest) {
  const { name, email, cuisine, termsAccepted } = (await request.json()) as RegistroBody;

  if (!name?.trim() || !email?.trim() || !cuisine || !termsAccepted) {
    return NextResponse.json(
      { error: 'Faltan campos obligatorios', code: 'API_REGISTRO_MISSING_FIELDS' },
      { status: 400 }
    );
  }

  if (!isCuisineType(cuisine)) {
    return NextResponse.json(
      { error: 'Tipo de cocina inválido', code: 'API_REGISTRO_INVALID_CUISINE' },
      { status: 400 }
    );
  }

  const supabase = createServerClient();

  const { data: created, error: createUserError } = await supabase.auth.admin.createUser({
    email,
    email_confirm: true,
  });

  if (createUserError || !created.user) {
    if (createUserError?.message.toLowerCase().includes('already')) {
      return NextResponse.json(
        {
          error: 'Ya existe una cuenta con ese correo. Iniciá sesión desde /admin/login.',
          code: 'API_REGISTRO_EMAIL_ALREADY_EXISTS',
        },
        { status: 409 }
      );
    }

    console.error('[API_REGISTRO_CREATE_USER_FAILED]', createUserError);
    return NextResponse.json(
      { error: 'No se pudo crear la cuenta', code: 'API_REGISTRO_CREATE_USER_FAILED' },
      { status: 500 }
    );
  }

  const ownerId = created.user.id;

  let slug: string;
  let shortId: string;
  try {
    slug = await generateUniqueSlug(supabase, name);
    shortId = await generateUniqueShortId(supabase);
  } catch (error) {
    console.error('[API_REGISTRO_SLUG_GENERATION_FAILED]', error);
    return NextResponse.json(
      {
        error: 'No se pudo generar un identificador único para el restaurante',
        code: 'API_REGISTRO_SLUG_GENERATION_FAILED',
      },
      { status: 500 }
    );
  }

  const forwardedFor = request.headers.get('x-forwarded-for');
  const ip = forwardedFor ? forwardedFor.split(',')[0].trim() : null;

  const { data: restaurant, error: restaurantError } = await supabase
    .from('restaurants')
    .insert({
      owner_id: ownerId,
      name,
      slug,
      short_id: shortId,
      is_published: false,
      terms_version: TERMS_VERSION,
      terms_accepted_at: new Date().toISOString(),
      terms_accepted_ip: ip,
    })
    .select()
    .single();

  if (restaurantError || !restaurant) {
    console.error('[API_REGISTRO_CREATE_RESTAURANT_FAILED]', restaurantError);
    return NextResponse.json(
      { error: 'No se pudo crear el restaurante', code: 'API_REGISTRO_CREATE_RESTAURANT_FAILED' },
      { status: 500 }
    );
  }

  // La plantilla es una ayuda para no arrancar en blanco, no un requisito
  // del registro: si falla sembrarla, se loguea pero no se tumba la
  // respuesta — el restaurante ya existe y el dueño puede armar el menú
  // a mano desde el panel.
  // Tipado explícito: MENU_TEMPLATES es `as const`, así que sin esto
  // `category.dishes.length` se infiere como el literal 2 o 3 (el largo
  // real de cada plantilla) en vez de `number`, y el chequeo de abajo
  // queda marcado como comparación imposible.
  const template: MenuTemplate = MENU_TEMPLATES[cuisine];
  for (const [categoryIndex, category] of template.categories.entries()) {
    const { data: insertedCategory, error: categoryError } = await supabase
      .from('categories')
      .insert({ restaurant_id: restaurant.id, name: category.name, position: categoryIndex })
      .select()
      .single();

    if (categoryError || !insertedCategory) {
      console.error('[API_REGISTRO_SEED_CATEGORY_FAILED]', categoryError);
      continue;
    }

    if (category.dishes.length === 0) continue;

    const { error: dishesError } = await supabase.from('dishes').insert(
      category.dishes.map((dish, dishIndex) => ({
        restaurant_id: restaurant.id,
        category_id: insertedCategory.id,
        name: dish.name,
        price_cents: 0,
        position: dishIndex,
      }))
    );

    if (dishesError) console.error('[API_REGISTRO_SEED_DISHES_FAILED]', dishesError);
  }

  // Sin emailRedirectTo el enlace aterriza en la raíz del sitio sin canjear
  // la sesión, igual que pasaba en /admin/login: hay que mandarlo al
  // callback, que es el único que sabe convertir el código en sesión.
  const origin = request.nextUrl.origin;
  const { error: otpError } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${origin}/auth/callback?next=/admin/mi-restaurante` },
  });
  if (otpError) {
    // Tampoco tumba la respuesta: el restaurante y la cuenta ya existen;
    // el dueño puede pedir el link de nuevo desde /admin/login.
    console.error('[API_REGISTRO_SEND_MAGIC_LINK_FAILED]', otpError);
  }

  return NextResponse.json({ restaurant }, { status: 201 });
}
