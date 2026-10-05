import { logError } from '@/lib/errors';

// Reordenar el menú dispara una escritura por plato movido, y guardar un
// formulario dispara una sola. Sin agrupar, arrastrar una categoría con
// ocho platos mandaría ocho avisos idénticos: se espera a que la ráfaga
// termine y se manda uno.
const DEBOUNCE_MS = 800;

let timer: ReturnType<typeof setTimeout> | null = null;

async function send(): Promise<void> {
  try {
    const response = await fetch('/api/revalidate-menu', { method: 'POST' });
    if (!response.ok) {
      logError('ADMIN_REVALIDATE_MENU_FAILED', `HTTP ${response.status}`);
    }
  } catch (error) {
    // Que no se refresque la carta no invalida el cambio: ya quedó
    // guardado en la base y el ISR lo tomará en la próxima hora.
    logError('ADMIN_REVALIDATE_MENU_FAILED', error);
  }
}

/** Avisa al servidor que la carta pública cambió. Agrupa ráfagas. */
export function requestMenuRevalidation(): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void send();
  }, DEBOUNCE_MS);
}

/** Igual que la anterior, pero sin esperar: para acciones puntuales que el
 *  dueño va a ir a comprobar de inmediato, como publicar un modelo. */
export async function requestMenuRevalidationNow(): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  await send();
}
