import { redirect } from 'next/navigation';
import { createServerSessionClient } from '@/lib/supabase/server-session-client';
import { MenuEditor } from '@/components/admin/MenuEditor';

export default async function AdminMenuPage() {
  const supabase = await createServerSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/admin/login');
  }

  const { data: restaurant } = await supabase
    .from('restaurants')
    .select('id')
    .eq('owner_id', user.id)
    .maybeSingle();

  if (!restaurant) {
    redirect('/admin/mi-restaurante');
  }

  const [{ data: categories }, { data: dishes }] = await Promise.all([
    supabase.from('categories').select('*').eq('restaurant_id', restaurant.id).order('position'),
    supabase.from('dishes').select('*').eq('restaurant_id', restaurant.id).order('position'),
  ]);

  // El poster del modelo activo de cada plato: sirve de miniatura en la
  // lista y, de paso, estar en este mapa es la señal de "ya tiene 3D".
  const dishIds = (dishes ?? []).map((dish) => dish.id);
  const posterByDishId: Record<string, string | null> = {};
  if (dishIds.length > 0) {
    const { data: assets } = await supabase
      .from('dish_assets')
      .select('dish_id, poster_url')
      .in('dish_id', dishIds)
      .eq('is_active', true);
    for (const asset of assets ?? []) {
      posterByDishId[asset.dish_id] = asset.poster_url;
    }
  }

  return (
    <MenuEditor
      restaurantId={restaurant.id}
      initialCategories={categories ?? []}
      initialDishes={dishes ?? []}
      posterByDishId={posterByDishId}
    />
  );
}
