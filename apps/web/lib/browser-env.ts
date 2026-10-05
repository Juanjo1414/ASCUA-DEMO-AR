// Los navegadores embebidos de WhatsApp, Instagram y compañía no exponen AR
// Quick Look ni Scene Viewer: el intent no llega al sistema y el visor se
// queda en 3D. No es un fallo del teléfono — un iPhone reciente falla igual
// dentro de WhatsApp y funciona al abrir la misma página en Safari.
const IN_APP_MARKERS: Array<[string, string]> = [
  ['WhatsApp', 'WhatsApp'],
  ['Instagram', 'Instagram'],
  ['FBAN', 'Facebook'],
  ['FBAV', 'Facebook'],
  ['FB_IAB', 'Facebook'],
  ['Messenger', 'Messenger'],
  ['Line/', 'LINE'],
  ['TikTok', 'TikTok'],
  ['Twitter', 'X'],
  ['LinkedInApp', 'LinkedIn'],
  ['Telegram', 'Telegram'],
];

/** Nombre de la app contenedora, o null si es un navegador normal. */
export function detectInAppBrowser(): string | null {
  if (typeof navigator === 'undefined') return null;
  const ua = navigator.userAgent || '';
  for (const [marker, label] of IN_APP_MARKERS) {
    if (ua.includes(marker)) return label;
  }
  return null;
}

export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  // iPadOS 13+ se anuncia como Macintosh; el touch lo delata.
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
}

export function isAndroid(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android/i.test(navigator.userAgent || '');
}
