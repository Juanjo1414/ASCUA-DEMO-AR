import { NextResponse, type NextRequest } from 'next/server';
import { createServerSessionClient } from '@/lib/supabase/server-session-client';
import { traducirTextos, DeepLError } from '@/lib/deepl';
import { esIdioma, idiomasPublicados, limitesDe, type Idioma } from '@/lib/plans';
import { revalidateMenuBySlug } from '@/lib/revalidate-menu';

// Traduce la carta entera a un idioma. Lo dispara el dueño desde el panel al
// activar un idioma o después de cambiar platos.
//
// Va por el servidor y no desde el navegador porque la clave de DeepL no puede
// salir al cliente: quien la tenga gasta la cuota de todos los restaurantes.

export async function POST(request: NextRequest) {
  const supabase = await createServerSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: 'No autenticado', code: 'API_TRADUCIR_UNAUTHENTICATED' },
      { status: 401 }
    );
  }

  const { lang } = (await request.json()) as { lang?: string };

  if (!lang || !esIdioma(lang)) {
    return NextResponse.json(
      { error: 'Idioma no soportado', code: 'API_TRADUCIR_IDIOMA_INVALIDO' },
      { status: 400 }
    );
  }

  const { data: restaurant } = await supabase
    .from('restaurants')
    .select('id, slug, plan, base_language, idiomas, idiomas_extra')
    .eq('owner_id', user.id)
    .maybeSingle();

  if (!restaurant) {
    return NextResponse.json(
      { error: 'Sin restaurante', code: 'API_TRADUCIR_SIN_RESTAURANTE' },
      { status: 404 }
    );
  }

  // El cupo manda: traducir a un idioma que no se puede publicar sería gastar
  // cuota de DeepL en algo que ningún comensal va a ver.
  const permitidos = idiomasPublicados(
    restaurant.plan,
    restaurant.base_language,
    restaurant.idiomas,
    restaurant.idiomas_extra
  );
  if (!permitidos.includes(lang)) {
    return NextResponse.json(
      {
        error: `Tu plan ${limitesDe(restaurant.plan).nombre} no incluye más idiomas. Pide un idioma adicional.`,
        code: 'API_TRADUCIR_PLAN_INSUFICIENTE',
      },
      { status: 403 }
    );
  }

  const idiomaBase = permitidos[0] as Idioma;
  if (lang === idiomaBase) {
    return NextResponse.json(
      { error: 'Ese ya es el idioma de tu carta', code: 'API_TRADUCIR_ES_EL_BASE' },
      { status: 400 }
    );
  }

  const [{ data: platos }, { data: categorias }, { data: yaTraducidos }] = await Promise.all([
    supabase
      .from('dishes')
      .select('id, name, description, updated_at')
      .eq('restaurant_id', restaurant.id),
    supabase.from('categories').select('id, name').eq('restaurant_id', restaurant.id),
    // Se traen todas, no sólo las editadas a mano: las automáticas que sigan
    // al día tampoco hay que regenerarlas.
    supabase
      .from('dish_translations')
      .select('dish_id, updated_at, editada_a_mano')
      .eq('lang', lang),
  ]);

  // Un plato se retraduce sólo si hace falta:
  //  - editada a mano: nunca, se perdería el trabajo del dueño;
  //  - traducción más nueva que el plato: tampoco, ya está al día. Eso es lo
  //    que evita gastar cuota cuando alguien reactiva un idioma que ya tuvo,
  //    o vuelve a pulsar el botón sin haber cambiado nada.
  const traducciones = new Map(
    (yaTraducidos ?? []).map((t) => [t.dish_id, t])
  );

  const platosATraducir = (platos ?? []).filter((plato) => {
    const previa = traducciones.get(plato.id);
    if (!previa) return true;
    if (previa.editada_a_mano) return false;
    return new Date(previa.updated_at) < new Date(plato.updated_at);
  });

  const reutilizados = (platos ?? []).length - platosATraducir.length;
  const categoriasATraducir = categorias ?? [];

  if (platosATraducir.length === 0 && categoriasATraducir.length === 0) {
    return NextResponse.json({ traducidos: 0, reutilizados });
  }

  try {
    // Todo en una sola tanda: nombres de plato, descripciones y categorías.
    // DeepL conserva el orden, así que se reparten de vuelta por índice.
    const textos: string[] = [];
    for (const plato of platosATraducir) {
      textos.push(plato.name);
      textos.push(plato.description ?? '');
    }
    for (const categoria of categoriasATraducir) {
      textos.push(categoria.name);
    }

    const traducidos = await traducirTextos(textos, lang, idiomaBase);

    let cursor = 0;
    const filasPlatos = platosATraducir.map((plato) => {
      const name = traducidos[cursor++];
      const description = traducidos[cursor++];
      return {
        dish_id: plato.id,
        lang,
        name,
        description: plato.description ? description : null,
        editada_a_mano: false,
        updated_at: new Date().toISOString(),
      };
    });

    const filasCategorias = categoriasATraducir.map((categoria) => ({
      category_id: categoria.id,
      lang,
      name: traducidos[cursor++],
      editada_a_mano: false,
      updated_at: new Date().toISOString(),
    }));

    if (filasPlatos.length > 0) {
      const { error } = await supabase
        .from('dish_translations')
        .upsert(filasPlatos, { onConflict: 'dish_id,lang' });
      if (error) throw new Error(error.message);
    }

    if (filasCategorias.length > 0) {
      const { error } = await supabase
        .from('category_translations')
        .upsert(filasCategorias, { onConflict: 'category_id,lang' });
      if (error) throw new Error(error.message);
    }

    revalidateMenuBySlug(restaurant.slug);

    return NextResponse.json({
      traducidos: filasPlatos.length,
      categorias: filasCategorias.length,
      reutilizados,
    });
  } catch (causa) {
    if (causa instanceof DeepLError) {
      console.error(`[${causa.code}]`, causa.message);
      return NextResponse.json({ error: causa.message, code: causa.code }, { status: 502 });
    }
    const mensaje = causa instanceof Error ? causa.message : String(causa);
    console.error('[API_TRADUCIR_FALLO]', mensaje);
    return NextResponse.json(
      { error: 'No se pudo traducir la carta', code: 'API_TRADUCIR_FALLO' },
      { status: 500 }
    );
  }
}
