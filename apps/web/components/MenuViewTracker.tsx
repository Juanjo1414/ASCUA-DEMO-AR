'use client';

import { useEffect } from 'react';
import { registrarEvento } from '@/lib/analytics';

/**
 * Registra que alguien abrió la carta. Va como componente propio para que la
 * página del menú siga siendo un componente de servidor: sólo esta pieza
 * necesita correr en el navegador.
 *
 * El control de "una sola vez" vive en lib/analytics.ts, a nivel de módulo:
 * un useRef aquí no alcanza, porque dos montajes simultáneos tienen cada uno
 * el suyo y ninguno ve el del otro.
 */
export function MenuViewTracker({ restaurantId }: { restaurantId: string }) {
  useEffect(() => {
    registrarEvento(restaurantId, 'menu_view', null, true);
  }, [restaurantId]);

  return null;
}
