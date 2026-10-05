import { redirect } from 'next/navigation';
import { createServerSessionClient } from '@/lib/supabase/server-session-client';
import { IdiomasForm } from '@/components/admin/IdiomasForm';
import { cupoIdiomasAdicionales, esIdioma, limitesDe, type Idioma } from '@/lib/plans';

export const dynamic = 'force-dynamic';

export default async function IdiomasPage() {
  const supabase = await createServerSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/admin/login');

  const { data: restaurant } = await supabase
    .from('restaurants')
    .select('id, plan, base_language, idiomas, idiomas_extra')
    .eq('owner_id', user.id)
    .maybeSingle();

  if (!restaurant) redirect('/admin/mi-restaurante');

  // Todos los planes incluyen al menos un idioma adicional, así que esta
  // pantalla ya no tiene un caso de "no incluido".
  const limites = limitesDe(restaurant.plan);
  const cupo = cupoIdiomasAdicionales(restaurant.plan, restaurant.idiomas_extra);

  const idiomaBase: Idioma = esIdioma(restaurant.base_language) ? restaurant.base_language : 'es';
  const activos = (restaurant.idiomas ?? []).filter(esIdioma);

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="font-serif text-2xl font-semibold tracking-tight text-cream">Idiomas</h1>
        <p className="mt-1 text-sm text-stone">
          Al activar un idioma traducimos tu carta automáticamente.
        </p>
      </header>

      <IdiomasForm
        restaurantId={restaurant.id}
        idiomaBase={idiomaBase}
        activosIniciales={activos}
        limites={limites}
        cupo={cupo}
      />
    </div>
  );
}
