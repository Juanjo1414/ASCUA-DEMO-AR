import { createServerSessionClient } from '@/lib/supabase/server-session-client';

// Consultas del panel de analítica, separadas de la interfaz para poder
// cambiarlas —o moverlas a una vista materializada cuando haya volumen— sin
// tocar la pantalla.
//
// Hoy se agregan en memoria: con un restaurante recibiendo unos cientos de
// visitas al mes eso es trivial. El día que una carta pase de ~50.000 eventos
// al mes, conviene hacer el conteo en la base con una vista agregada.

export interface ResumenAnalitica {
  vistasCarta: number;
  visitantes: number;
  aperturas3d: number;
  aperturasAr: number;
  platos: PlatoAnalitica[];
  desde: string;
}

export interface PlatoAnalitica {
  dishId: string;
  nombre: string;
  vistas3d: number;
  vistasAr: number;
  total: number;
}

/** Ventana por defecto del panel. */
export const DIAS_POR_DEFECTO = 30;

export async function obtenerResumen(
  restaurantId: string,
  dias: number = DIAS_POR_DEFECTO
): Promise<ResumenAnalitica> {
  const supabase = await createServerSessionClient();
  const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();

  // RLS ya limita las filas a los eventos de este dueño; el filtro por
  // restaurant_id es para no traer los de sus otros restaurantes.
  const { data: eventos } = await supabase
    .from('menu_events')
    .select('type, dish_id, session_id')
    .eq('restaurant_id', restaurantId)
    .gte('created_at', desde);

  const filas = eventos ?? [];

  const sesiones = new Set<string>();
  let vistasCarta = 0;
  let aperturas3d = 0;
  let aperturasAr = 0;
  const porPlato = new Map<string, { vistas3d: number; vistasAr: number }>();

  for (const fila of filas) {
    sesiones.add(fila.session_id);

    if (fila.type === 'menu_view') {
      vistasCarta += 1;
      continue;
    }

    if (!fila.dish_id) continue;
    const actual = porPlato.get(fila.dish_id) ?? { vistas3d: 0, vistasAr: 0 };

    if (fila.type === 'view_3d') {
      aperturas3d += 1;
      actual.vistas3d += 1;
    } else if (fila.type === 'view_ar') {
      aperturasAr += 1;
      actual.vistasAr += 1;
    }
    porPlato.set(fila.dish_id, actual);
  }

  // Los nombres se piden aparte y sólo de los platos que tuvieron actividad.
  const ids = [...porPlato.keys()];
  const nombres = new Map<string, string>();
  if (ids.length > 0) {
    const { data: platos } = await supabase.from('dishes').select('id, name').in('id', ids);
    for (const plato of platos ?? []) nombres.set(plato.id, plato.name);
  }

  const platos: PlatoAnalitica[] = ids
    .map((dishId) => {
      const conteo = porPlato.get(dishId)!;
      return {
        dishId,
        // Un plato borrado después de haber sido visto conserva sus números.
        nombre: nombres.get(dishId) ?? 'Plato eliminado',
        vistas3d: conteo.vistas3d,
        vistasAr: conteo.vistasAr,
        total: conteo.vistas3d + conteo.vistasAr,
      };
    })
    .sort((a, b) => b.total - a.total);

  return {
    vistasCarta,
    visitantes: sesiones.size,
    aperturas3d,
    aperturasAr,
    platos,
    desde,
  };
}
