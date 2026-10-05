import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@menu-ar/db';
import type { Idioma } from '@/lib/plans';

// Aplica las traducciones sobre los platos y las categorías.
//
// El idioma base no tiene fila en dish_translations: es lo que el dueño
// escribió en la carta. Sólo se consulta la tabla cuando el comensal pidió
// otro idioma, así que una carta monolingüe no paga ninguna consulta extra.

type Dish = Database['public']['Tables']['dishes']['Row'];
type Category = Database['public']['Tables']['categories']['Row'];

export async function traducirCarta<D extends Dish, C extends Category>(
  supabase: SupabaseClient<Database>,
  platos: D[],
  categorias: C[],
  lang: Idioma,
  idiomaBase: Idioma
): Promise<{ platos: D[]; categorias: C[] }> {
  if (lang === idiomaBase) return { platos, categorias };

  const dishIds = platos.map((p) => p.id);
  const categoryIds = categorias.map((c) => c.id);

  const [{ data: tradPlatos }, { data: tradCategorias }] = await Promise.all([
    dishIds.length > 0
      ? supabase
          .from('dish_translations')
          .select('dish_id, name, description')
          .eq('lang', lang)
          .in('dish_id', dishIds)
      : Promise.resolve({ data: [] as Array<{ dish_id: string; name: string; description: string | null }> }),
    categoryIds.length > 0
      ? supabase
          .from('category_translations')
          .select('category_id, name')
          .eq('lang', lang)
          .in('category_id', categoryIds)
      : Promise.resolve({ data: [] as Array<{ category_id: string; name: string }> }),
  ]);

  const porPlato = new Map((tradPlatos ?? []).map((t) => [t.dish_id, t]));
  const porCategoria = new Map((tradCategorias ?? []).map((t) => [t.category_id, t]));

  return {
    // Un plato sin traducir se queda en el idioma base en vez de desaparecer:
    // es preferible que el turista lea un nombre en español a que la carta
    // tenga huecos.
    platos: platos.map((plato) => {
      const t = porPlato.get(plato.id);
      return t ? { ...plato, name: t.name, description: t.description ?? plato.description } : plato;
    }),
    categorias: categorias.map((categoria) => {
      const t = porCategoria.get(categoria.id);
      return t ? { ...categoria, name: t.name } : categoria;
    }),
  };
}
