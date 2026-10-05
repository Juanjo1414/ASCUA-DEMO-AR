// Reglas de "agotado", sin dependencias para poder probarlas solas.

/** Un plato está agotado mientras su fecha de vencimiento siga en el futuro. */
export function estaAgotado(
  hasta: string | null | undefined,
  ahora: number = Date.now()
): boolean {
  if (!hasta) return false;
  const vence = new Date(hasta).getTime();
  return Number.isFinite(vence) && vence > ahora;
}

/**
 * Próxima medianoche en la zona horaria de quien llama.
 *
 * Se calcula en el navegador del dueño a propósito: el panel de un
 * restaurante en Malta corre en Malta, así que "medianoche" cae en la hora
 * de Malta sin guardar la zona horaria de cada restaurante.
 */
export function siguienteMedianoche(desde: Date = new Date()): Date {
  const d = new Date(desde.getTime());
  // setHours(24) pasa al día siguiente a las 00:00 locales, incluso en
  // fin de mes y en cambios de horario.
  d.setHours(24, 0, 0, 0);
  return d;
}
