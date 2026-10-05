import type { Idioma } from '@/lib/plans';

// Traducción con DeepL.
//
// Se eligió sobre Google por dos razones: en italiano y alemán —los idiomas
// que importan en Malta— la calidad es notablemente mejor, y su capa gratuita
// (500.000 caracteres al mes) cubre de sobra el volumen de una carta, que son
// unas pocas decenas de frases cortas por restaurante.

const IDIOMA_A_DEEPL: Record<Idioma, string> = {
  es: 'ES',
  en: 'EN-GB',
  it: 'IT',
  de: 'DE',
  fr: 'FR',
};

export class DeepLError extends Error {
  constructor(
    message: string,
    readonly code: string
  ) {
    super(message);
    this.name = 'DeepLError';
  }
}

/**
 * Las claves gratuitas terminan en ':fx' y van a otro host. Detectarlo evita
 * que alguien pegue su clave y reciba un 403 sin saber por qué.
 */
function endpointPara(apiKey: string): string {
  return apiKey.endsWith(':fx')
    ? 'https://api-free.deepl.com/v2/translate'
    : 'https://api.deepl.com/v2/translate';
}

/**
 * Traduce varios textos de una. DeepL acepta hasta 50 por llamada y conserva
 * el orden, así que una carta entera se traduce en una o dos peticiones en vez
 * de una por plato.
 */
export async function traducirTextos(
  textos: string[],
  destino: Idioma,
  origen: Idioma
): Promise<string[]> {
  if (textos.length === 0) return [];

  const apiKey = process.env.DEEPL_API_KEY;
  if (!apiKey) {
    throw new DeepLError('Falta DEEPL_API_KEY en el entorno.', 'DEEPL_SIN_CLAVE');
  }

  const respuesta = await fetch(endpointPara(apiKey), {
    method: 'POST',
    headers: {
      Authorization: `DeepL-Auth-Key ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text: textos,
      source_lang: IDIOMA_A_DEEPL[origen],
      target_lang: IDIOMA_A_DEEPL[destino],
      // Los nombres de plato son fragmentos, no prosa: sin esto DeepL les
      // mete puntos finales y mayúsculas de oración.
      split_sentences: '0',
      // "Lomo al trapo" o "Ajiaco" no se traducen, se transliteran mal. El
      // contexto de carta ayuda a que los deje en paz.
      context: 'Nombre o descripción de un plato en la carta de un restaurante.',
    }),
  });

  if (!respuesta.ok) {
    const detalle = await respuesta.text();
    // 456 es cuota agotada: merece un mensaje propio porque es el error que
    // el dueño va a ver si el mes se pasó de caracteres.
    if (respuesta.status === 456) {
      throw new DeepLError('Se agotó la cuota de traducción del mes.', 'DEEPL_CUOTA_AGOTADA');
    }
    throw new DeepLError(
      `DeepL respondió ${respuesta.status}: ${detalle.slice(0, 200)}`,
      'DEEPL_ERROR_HTTP'
    );
  }

  const datos = (await respuesta.json()) as { translations?: Array<{ text: string }> };
  const traducciones = datos.translations ?? [];

  if (traducciones.length !== textos.length) {
    throw new DeepLError(
      `DeepL devolvió ${traducciones.length} traducciones para ${textos.length} textos.`,
      'DEEPL_RESPUESTA_INCOMPLETA'
    );
  }

  return traducciones.map((t) => t.text);
}
