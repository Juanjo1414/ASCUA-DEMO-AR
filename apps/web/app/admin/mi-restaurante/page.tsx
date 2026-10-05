import { redirect } from 'next/navigation';
import { createServerSessionClient } from '@/lib/supabase/server-session-client';
import { RestaurantSettingsForm } from '@/components/admin/RestaurantSettingsForm';

export default async function MiRestaurantePage() {
  const supabase = await createServerSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/admin/login');
  }

  // maybeSingle(): el dueño puede no tener restaurante todavía (primera
  // vez que entra). El propio formulario decide entre crear o editar.
  const { data: restaurant } = await supabase
    .from('restaurants')
    .select('*')
    .eq('owner_id', user.id)
    .maybeSingle();

  return <RestaurantSettingsForm restaurant={restaurant} ownerId={user.id} />;
}
