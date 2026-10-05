// Límites de cada plan, en un solo sitio.
//
// Si mañana Growth pasa de 15 a 20 platos, se cambia acá y nada más: ni
// migración, ni tocar el panel, ni buscar números sueltos por el código. La
// base sólo guarda qué plan contrató cada restaurante (restaurants.plan) y lo
// que se le haya activado aparte (restaurants.idiomas_extra).

export const PLANES = ['starter', 'growth', 'business'] as const;
export type Plan = (typeof PLANES)[number];

/** Idiomas que la carta sabe servir. */
export const IDIOMAS = ['es', 'en', 'it', 'de', 'fr'] as const;
export type Idioma = (typeof IDIOMAS)[number];

export const NOMBRE_IDIOMA: Record<Idioma, string> = {
  es: 'Español',
  en: 'English',
  it: 'Italiano',
  de: 'Deutsch',
  fr: 'Français',
};

export interface LimitesPlan {
  /** Nombre como aparece en el catálogo. */
  nombre: string;
  /** Platos con modelo 3D/AR. null = sin límite. */
  maxPlatos3d: number | null;
  /** Usuarios con acceso al panel. null = sin límite. */
  maxUsuarios: number | null;
  /**
   * Idiomas ADICIONALES al base que incluye el plan. null = todos.
   *
   * Todos los planes traen dos idiomas en total: cobrar la traducción no se
   * sostiene cuando el navegador del comensal ya traduce gratis, y a nosotros
   * nos cuesta casi nada. Un tercero se cobra y se activa por restaurante con
   * restaurants.idiomas_extra, sin tener que subirlo de plan.
   */
  maxIdiomasAdicionales: number | null;
  /**
   * Vistas de carta y platos más vistos. Incluida en todos los planes: es lo
   * que le muestra al dueño para qué paga, y quien más la necesita para no
   * cancelar es justo el cliente del plan más barato.
   */
  analitica: boolean;
}

export const LIMITES: Record<Plan, LimitesPlan> = {
  starter: {
    nombre: 'Starter',
    maxPlatos3d: 5,
    maxUsuarios: 1,
    maxIdiomasAdicionales: 1,
    analitica: true,
  },
  growth: {
    nombre: 'Growth',
    maxPlatos3d: 15,
    maxUsuarios: 3,
    maxIdiomasAdicionales: 1,
    analitica: true,
  },
  business: {
    nombre: 'Business',
    maxPlatos3d: null,
    maxUsuarios: null,
    maxIdiomasAdicionales: null,
    analitica: true,
  },
};

/**
 * Límites del plan. Un valor desconocido —plan retirado del catálogo, dato
 * escrito a mano— cae en starter en vez de reventar: es preferible que un
 * restaurante vea de menos a que su carta deje de cargar.
 */
export function limitesDe(plan: string | null | undefined): LimitesPlan {
  return LIMITES[(plan ?? 'starter') as Plan] ?? LIMITES.starter;
}

export function tieneAnalitica(plan: string | null | undefined): boolean {
  return limitesDe(plan).analitica;
}

export function esIdioma(valor: string): valor is Idioma {
  return (IDIOMAS as readonly string[]).includes(valor);
}

/**
 * Cuántos idiomas adicionales puede publicar un restaurante: lo que trae su
 * plan más lo que se le haya activado aparte. null = sin límite.
 */
export function cupoIdiomasAdicionales(
  plan: string | null | undefined,
  idiomasExtra: number | null | undefined
): number | null {
  const incluidos = limitesDe(plan).maxIdiomasAdicionales;
  if (incluidos === null) return null;
  const extra =
    typeof idiomasExtra === 'number' && Number.isFinite(idiomasExtra)
      ? Math.max(0, Math.trunc(idiomasExtra))
      : 0;
  return incluidos + extra;
}

/**
 * Idiomas que la carta publica: el base primero y después los activos que el
 * cupo alcance a cubrir.
 *
 * El recorte se hace aquí y no al guardar a propósito: un restaurante que
 * pierde un idioma extra, o baja de Business, conserva sus traducciones y las
 * recupera enteras si vuelve a tenerlo, en vez de perderlas.
 */
export function idiomasPublicados(
  plan: string | null | undefined,
  base: string | null | undefined,
  activos: string[] | null | undefined,
  idiomasExtra: number | null | undefined = 0
): Idioma[] {
  const idiomaBase: Idioma = base && esIdioma(base) ? base : 'es';
  const cupo = cupoIdiomasAdicionales(plan, idiomasExtra);
  if (cupo === 0) return [idiomaBase];

  const adicionales = (activos ?? [])
    .filter(esIdioma)
    .filter((lang, i, lista) => lang !== idiomaBase && lista.indexOf(lang) === i);

  const permitidos = cupo === null ? adicionales : adicionales.slice(0, cupo);
  return [idiomaBase, ...permitidos];
}
