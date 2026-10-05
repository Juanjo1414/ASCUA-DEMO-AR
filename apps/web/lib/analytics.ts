'use client';

import { createBrowserClient } from '@/lib/supabase/browser-client';

// Registro de eventos de la carta.
//
// Deliberadamente anónimo: no se guarda IP, ni user agent, ni cookie de
// seguimiento. El identificador de sesión es aleatorio, vive en
// sessionStorage y desaparece al cerrar la pestaña — sirve para no contar
// diez veces al mismo comensal, no para reconocerlo mañana.
//
// Sin datos personales no hace falta consentimiento de cookies en la UE, y la
// carta abre limpia en la mesa. Si algún día se añade algo que identifique a
// alguien, eso deja de ser cierto.

export type TipoEvento = 'menu_view' | 'dish_view' | 'view_3d' | 'view_ar';

const CLAVE_SESION = 'ascua_sid';

// El identificador se resuelve una vez por carga de página y se guarda acá.
// Sin esto, dos montajes simultáneos del mismo componente leían sessionStorage
// vacío a la vez, cada uno generaba su propio uuid y la misma visita quedaba
// contada como dos comensales distintos — pasó en la primera prueba real: dos
// menu_view en el mismo segundo con sesiones diferentes.
let sesionEnMemoria: string | null = null;

function idDeSesion(): string | null {
  if (sesionEnMemoria) return sesionEnMemoria;

  try {
    let id = sessionStorage.getItem(CLAVE_SESION);
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem(CLAVE_SESION, id);
    }
    sesionEnMemoria = id;
    return id;
  } catch {
    // Modo privado o almacenamiento bloqueado: se usa un identificador que
    // vive sólo en memoria. Se pierde al recargar, pero evita perder la
    // medición entera y nunca rompe la carta.
    sesionEnMemoria = crypto.randomUUID();
    return sesionEnMemoria;
  }
}

// Eventos ya registrados en esta carga de página. El guard vive en el módulo y
// no en el componente a propósito: cada instancia tiene su propio useRef, así
// que dos montajes se saltaban el control de la otra.
const yaRegistrados = new Set<string>();

/**
 * Registra un evento. Nunca lanza ni bloquea: la analítica es accesoria y un
 * fallo suyo no puede impedir que el comensal vea el menú.
 *
 * `unaVezPorCarga` es para los eventos que describen la visita —abrir la
 * carta— y no una acción repetible como tocar un plato.
 */
export function registrarEvento(
  restaurantId: string,
  tipo: TipoEvento,
  dishId?: string | null,
  unaVezPorCarga = false
): void {
  const clave = `${tipo}:${restaurantId}:${dishId ?? ''}`;
  if (unaVezPorCarga) {
    if (yaRegistrados.has(clave)) return;
    yaRegistrados.add(clave);
  }

  const sessionId = idDeSesion();
  if (!sessionId) return;

  try {
    const supabase = createBrowserClient();
    void supabase
      .from('menu_events')
      .insert({
        restaurant_id: restaurantId,
        dish_id: dishId ?? null,
        type: tipo,
        session_id: sessionId,
      })
      .then(() => {
        // Sin manejo de error a propósito: si la inserción falla, el comensal
        // no tiene por qué enterarse.
      });
  } catch {
    // Igual que arriba.
  }
}
