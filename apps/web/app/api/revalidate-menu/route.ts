import { NextResponse } from 'next/server';
import { createServerSessionClient } from '@/lib/supabase/server-session-client';
import { revalidateMenuBySlug } from '@/lib/revalidate-menu';

// El panel escribe en Supabase desde el navegador, así que sus cambios
// nunca tocan el servidor de Next y el menú cacheado no se entera. Esta
// ruta es el aviso: el panel la llama después de guardar algo que se ve en
// la carta.
//
// No recibe ningún id: el restaurante sale de la sesión, así que nadie
// puede forzar la revalidación del menú de otro.
export async function POST() {
  const supabase = await createServerSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: 'No autenticado', code: 'API_REVALIDATE_MENU_UNAUTHENTICATED' },
      { status: 401 }
    );
  }

  const { data: restaurant } = await supabase
    .from('restaurants')
    .select('slug')
    .eq('owner_id', user.id)
    .maybeSingle();

  if (!restaurant?.slug) {
    return NextResponse.json(
      { error: 'Sin restaurante', code: 'API_REVALIDATE_MENU_NO_RESTAURANT' },
      { status: 404 }
    );
  }

  revalidateMenuBySlug(restaurant.slug);

  return NextResponse.json({ revalidated: true, slug: restaurant.slug });
}
