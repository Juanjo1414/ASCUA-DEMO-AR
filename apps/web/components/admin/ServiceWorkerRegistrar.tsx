'use client';

import { useEffect } from 'react';

// Registra el service worker sólo dentro del panel: la carta del comensal se
// abre una vez desde un QR y no gana nada con un worker instalado, mientras
// que el dueño abre el panel a diario.
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV !== 'production') return;

    const register = () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/admin' }).catch(() => {
        // Un registro fallido no puede tumbar el panel: sin service worker
        // todo sigue funcionando, sólo se pierde la pantalla de sin conexión.
      });
    };

    if (document.readyState === 'complete') {
      register();
    } else {
      window.addEventListener('load', register, { once: true });
      return () => window.removeEventListener('load', register);
    }
  }, []);

  return null;
}
