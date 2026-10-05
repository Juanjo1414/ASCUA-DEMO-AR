// El QR apunta siempre al enlace corto inmutable (/r/{short_id}), nunca
// directo a /m/[slug] — ver sección 0 del plan. Separado en su propia
// función pura para poder testearlo sin generar un QR de verdad.
export function buildQrTargetUrl(baseUrl: string, shortId: string): string {
  return new URL(`/r/${shortId}`, baseUrl).toString();
}
