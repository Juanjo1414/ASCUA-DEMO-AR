import { isAndroid, isIOS } from './browser-env';

// Abrir la RA directo, sin pasar por <model-viewer>. model-viewer necesita
// estar montado y con el modelo cargado antes de poder activar nada, lo que
// obliga al comensal a dar un segundo toque dentro del visor. Quick Look y
// Scene Viewer se invocan con un solo gesto si se llama al mecanismo nativo
// de cada sistema — y ese gesto es el toque en la tarjeta del plato.

interface LaunchArOptions {
  glbUrl: string;
  usdzUrl?: string | null;
  posterUrl: string;
  title: string;
  /** El modelo ya viene normalizado al tamaño real del plato desde el
   *  pipeline, así que por defecto no se deja redimensionar: el sentido del
   *  AR aquí es que el comensal vea la porción tal como se la van a traer. */
  allowScaling?: boolean;
}

/** iOS: un <a rel="ar"> con una <img> dentro es lo que dispara Quick Look. */
function launchQuickLook(usdzUrl: string, posterUrl: string, allowScaling: boolean) {
  const anchor = document.createElement('a');
  anchor.setAttribute('rel', 'ar');
  anchor.href = `${usdzUrl}#allowsContentScaling=${allowScaling ? 1 : 0}`;
  anchor.style.display = 'none';

  // Sin una <img> hija, Safari abre el USDZ como descarga en vez de Quick Look.
  const img = document.createElement('img');
  img.src = posterUrl;
  img.alt = '';
  anchor.appendChild(img);

  document.body.appendChild(anchor);
  anchor.click();
  setTimeout(() => anchor.remove(), 1000);
}

/** Android: Scene Viewer se abre por intent:// con el GLB como parámetro. */
function launchSceneViewer(glbUrl: string, title: string, allowScaling: boolean) {
  const params = new URLSearchParams({
    file: glbUrl,
    mode: 'ar_preferred',
    resizable: allowScaling ? 'true' : 'false',
    title,
  });
  const fallback = encodeURIComponent(window.location.href);
  const intent =
    `intent://arvr.google.com/scene-viewer/1.0?${params.toString()}` +
    `#Intent;scheme=https;package=com.google.android.googlequicksearchbox;` +
    `action=android.intent.action.VIEW;S.browser_fallback_url=${fallback};end;`;
  window.location.href = intent;
}

/**
 * Lanza la RA nativa. Devuelve false si el aparato no tiene ninguna de las dos
 * vías, para que quien llame muestre el aviso correspondiente.
 */
export function launchAr({
  glbUrl,
  usdzUrl,
  posterUrl,
  title,
  allowScaling = false,
}: LaunchArOptions): boolean {
  if (isIOS()) {
    if (!usdzUrl) return false;
    launchQuickLook(usdzUrl, posterUrl, allowScaling);
    return true;
  }

  if (isAndroid()) {
    if (!glbUrl) return false;
    launchSceneViewer(glbUrl, title, allowScaling);
    return true;
  }

  return false;
}
