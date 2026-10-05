import { notFound, redirect } from 'next/navigation';
import { createServerSessionClient } from '@/lib/supabase/server-session-client';
import { DishDetailForm } from '@/components/admin/DishDetailForm';

export default async function DishDetailPage({
  params,
}: {
  params: Promise<{ dishId: string }>;
}) {
  const { dishId } = await params;
  const supabase = await createServerSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/admin/login');
  }

  // RLS ("owner dishes") ya filtra por dueño: si no es suyo, esto no
  // devuelve nada aunque el id exista.
  const { data: dish } = await supabase.from('dishes').select('*').eq('id', dishId).single();

  if (!dish) {
    notFound();
  }

  const [{ data: restaurant }, { data: categories }, { data: assets }, { data: latestJob }] =
    await Promise.all([
      supabase.from('restaurants').select('*').eq('id', dish.restaurant_id).single(),
      supabase
        .from('categories')
        .select('*')
        .eq('restaurant_id', dish.restaurant_id)
        .order('position'),
      supabase
        .from('dish_assets')
        .select('*')
        .eq('dish_id', dish.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('jobs')
        .select('*')
        .eq('dish_id', dish.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  if (!restaurant) {
    notFound();
  }

  return (
    <DishDetailForm
      dish={dish}
      categories={categories ?? []}
      assets={assets ?? []}
      latestJob={latestJob}
      photoRightsAcceptedAt={restaurant.photo_rights_accepted_at}
      ownerId={user.id}
    />
  );
}
