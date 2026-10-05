import { revalidatePath } from 'next/cache';
import { createServerClient } from '@/lib/supabase/server-client';

// El menú público (`app/m/[slug]`) se prerenderiza y se sirve cacheado con
// `revalidate = 3600`. Sin esto, cualquier cambio del panel tarda hasta una
// hora en verse, y el dueño que entra a comprobar su carta no encuentra lo
// que acaba de guardar.
//
// Va por `revalidatePath` y no por `revalidateTag`: la página lee con el
// cliente de Supabase, no con el `fetch` cacheado de Next, así que no hay
// ningún fetch al que colgarle una tag. El `revalidateTag` que había antes
// invalidaba una etiqueta que nadie emitía, o sea nada.
export async function revalidateMenuByRestaurantId(restaurantId: string): Promise<boolean> {
  const supabase = createServerClient();

  const { data: restaurant } = await supabase
    .from('restaurants')
    .select('slug')
    .eq('id', restaurantId)
    .maybeSingle();

  if (!restaurant?.slug) return false;

  revalidateMenuBySlug(restaurant.slug);
  return true;
}

export function revalidateMenuBySlug(slug: string): void {
  // El menú y el redirector corto del QR: ambos leen del mismo dato.
  revalidatePath(`/m/${slug}`);
}
