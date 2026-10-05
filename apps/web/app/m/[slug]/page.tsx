import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { createServerClient } from '@/lib/supabase/server-client';
import { DishCard } from '@/components/DishCard';
import { CategoryNav } from '@/components/CategoryNav';
import { LanguagePicker } from '@/components/LanguagePicker';
import { AgotadosProvider } from '@/components/AgotadosProvider';
import { MenuViewTracker } from '@/components/MenuViewTracker';
import { groupDishesByCategory } from '@/lib/group-dishes-by-category';
import { idiomasPublicados, esIdioma, type Idioma } from '@/lib/plans';
import { traducirCarta } from '@/lib/menu-translations';
import { textos } from '@/lib/menu-i18n';
import type { Database } from '@menu-ar/db';

// 60 y no 3600: el panel pide revalidar al guardar, así que un cambio de
// precio se ve al instante por esa vía. Este número es la red de seguridad
// para cuando esa llamada no llega — el navegador del dueño sin señal, un
// fallo puntual — y una hora de precio viejo delante de un comensal es mucho
// peor que regenerar la carta cada minuto.
export const revalidate = 60;

type Category = Database['public']['Tables']['categories']['Row'];
type DishAsset = Database['public']['Tables']['dish_assets']['Row'];

export async function generateStaticParams() {
  const supabase = createServerClient();
  const { data: restaurants } = await supabase
    .from('restaurants')
    .select('slug')
    .eq('is_published', true);

  return (restaurants ?? []).map((restaurant) => ({ slug: restaurant.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const supabase = createServerClient();
  const { data: restaurant } = await supabase
    .from('restaurants')
    .select('name')
    .eq('slug', slug)
    .eq('is_published', true)
    .single();

  if (!restaurant) return { title: 'Carta' };

  // La carta se comparte por WhatsApp constantemente: sin esto el enlace llega
  // como una URL pelada en vez del nombre del restaurante.
  return {
    title: `${restaurant.name} — Carta`,
    description: `Carta de ${restaurant.name}. Mira cada plato en 3D y sobre tu mesa en realidad aumentada.`,
    openGraph: {
      title: `${restaurant.name} — Carta`,
      description: 'Mira cada plato en 3D y sobre tu mesa en realidad aumentada.',
      type: 'website',
    },
  };
}

export default async function MenuPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const { slug } = await params;
  const { lang: langPedido } = await searchParams;
  const supabase = createServerClient();

  const { data: restaurant } = await supabase
    .from('restaurants')
    .select('id, name, plan, base_language, idiomas, idiomas_extra, sin_marca')
    .eq('slug', slug)
    .eq('is_published', true)
    .single();

  if (!restaurant) {
    notFound();
  }

  // Qué idiomas puede publicar: los del plan más los activados aparte.
  const disponibles = idiomasPublicados(
    restaurant.plan,
    restaurant.base_language,
    restaurant.idiomas,
    restaurant.idiomas_extra
  );
  const idiomaBase = disponibles[0];

  // Un ?lang= que el restaurante no tiene activo cae al base en vez de dar
  // error: el enlace puede venir compartido de otra carta o de otro plan.
  const lang: Idioma =
    langPedido && esIdioma(langPedido) && disponibles.includes(langPedido)
      ? langPedido
      : idiomaBase;

  const t = textos(lang);

  const [{ data: categories }, { data: dishes }] = await Promise.all([
    supabase.from('categories').select('*').eq('restaurant_id', restaurant.id).order('position'),
    supabase
      .from('dishes')
      .select('*')
      .eq('restaurant_id', restaurant.id)
      .eq('is_available', true)
      .order('position'),
  ]);

  const { platos: dishList, categorias: orderedCategories } = await traducirCarta(
    supabase,
    dishes ?? [],
    (categories ?? []) as Category[],
    lang,
    idiomaBase
  );

  const dishesByCategory = groupDishesByCategory(dishList);

  // Punto de partida del aviso en vivo: lo que había al renderizar. Desde ahí
  // AgotadosProvider escucha los cambios sin recargar.
  const agotadoInicial = Object.fromEntries(
    dishList.map((dish) => [dish.id, dish.agotado_hasta ?? null])
  );

  // Fase 3 — sólo los platos con un dish_assets aprobado (is_active=true)
  // ofrecen el botón de AR; el resto se queda con la foto 2D de Fase 2.
  let activeAssets: DishAsset[] = [];
  const dishIds = dishList.map((dish) => dish.id);
  if (dishIds.length > 0) {
    const { data } = await supabase
      .from('dish_assets')
      .select('*')
      .in('dish_id', dishIds)
      .eq('is_active', true);
    activeAssets = data ?? [];
  }
  const activeAssetByDishId = new Map(activeAssets.map((asset) => [asset.dish_id, asset]));

  const categoriasConPlatos = orderedCategories.filter(
    (category) => (dishesByCategory.get(category.id) ?? []).length > 0
  );

  let dishIndex = 0;

  return (
    <div className="min-h-screen bg-charcoal-950">
      <MenuViewTracker restaurantId={restaurant.id} />

      <header className="border-b border-copper-900/30 px-5 pb-7 pt-10 text-center">
        <h1 className="font-serif text-2xl font-semibold tracking-tight text-cream">
          {restaurant.name}
        </h1>
        <p className="mt-2 text-sm text-stone">{t.invitacion}</p>

        {disponibles.length > 1 ? (
          <div className="mt-4 flex justify-center">
            <LanguagePicker idiomas={disponibles} actual={lang} etiqueta={t.idioma} />
          </div>
        ) : null}
      </header>

      {/* Más de una categoría es lo que justifica una barra de navegación; con
          una sola, ocupa espacio y no lleva a ninguna parte. */}
      {categoriasConPlatos.length > 1 ? (
        <CategoryNav categories={categoriasConPlatos.map((c) => ({ id: c.id, name: c.name }))} />
      ) : null}

      <AgotadosProvider restaurantId={restaurant.id} iniciales={agotadoInicial}>
      <main className="mx-auto flex max-w-3xl flex-col gap-10 px-5 py-8">
        {categoriasConPlatos.map((category) => {
          const dishesInCategory = dishesByCategory.get(category.id) ?? [];

          return (
            <section key={category.id} id={`categoria-${category.id}`} className="scroll-mt-20">
              <h2 className="mb-4 font-serif text-lg font-semibold tracking-tight text-copper-300">
                {category.name}
              </h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {dishesInCategory.map((dish) => {
                  const priority = dishIndex < 2;
                  dishIndex += 1;
                  return (
                    <DishCard
                      key={dish.id}
                      dish={dish}
                      arAsset={activeAssetByDishId.get(dish.id) ?? null}
                      priority={priority}
                      restaurantId={restaurant.id}
                      dishId={dish.id}
                      textoVer3d={t.ver3d}
                      textoVerAr={t.verAr}
                      textoCerrar={t.cerrar}
                      textoAviso={t.aviso}
                      textoAgotado={t.agotado}
                    />
                  );
                })}
              </div>
            </section>
          );
        })}
      </main>
      </AgotadosProvider>

      <footer className="border-t border-copper-900/30 px-5 py-8 text-center">
        <p className="text-xs text-stone/70">{t.aviso}</p>

        {/* Una sola vez y al pie, no en cada plato: la carta es del
            restaurante, y treinta logos repetidos se leen como publicidad
            dentro de su marca. Quitarla es un complemento pagado. */}
        {restaurant.sin_marca ? null : (
          <p className="mt-5 flex items-center justify-center gap-2 text-[11px] tracking-wide text-stone/60">
            <span>{t.hechoCon}</span>
            {/* eslint-disable-next-line @next/next/no-img-element -- logo de 1 KB, no justifica el optimizador */}
            <img src="/pits-logo.png" alt="PITS" className="h-4 w-auto" />
          </p>
        )}
      </footer>
    </div>
  );
}
