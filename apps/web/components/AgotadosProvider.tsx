'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { createBrowserClient } from '@/lib/supabase/browser-client';
import { estaAgotado } from '@/lib/agotado';

type Consulta = (dishId: string) => boolean;

const AgotadosContext = createContext<Consulta>(() => false);

/**
 * Mantiene al día qué platos están agotados mientras el comensal tiene la
 * carta abierta.
 *
 * Sin esto, "agotado" sólo se veía al recargar: alguien con la carta abierta
 * desde hace diez minutos pedía un plato que ya no había.
 */
export function AgotadosProvider({
  restaurantId,
  iniciales,
  children,
}: {
  restaurantId: string;
  /** dishId -> agotado_hasta, tal como salió del servidor al renderizar. */
  iniciales: Record<string, string | null>;
  children: ReactNode;
}) {
  const [hastaPorPlato, setHastaPorPlato] = useState(iniciales);
  const [ahora, setAhora] = useState(() => Date.now());

  // A medianoche no hay ningún cambio en la base que avise: el vencimiento
  // se revisa con un reloj, para que el plato vuelva solo aunque la carta
  // lleve abierta toda la noche.
  useEffect(() => {
    const reloj = setInterval(() => setAhora(Date.now()), 60_000);
    return () => clearInterval(reloj);
  }, []);

  useEffect(() => {
    const supabase = createBrowserClient();
    const canal = supabase
      .channel(`agotados-${restaurantId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'dishes',
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        (payload) => {
          const fila = payload.new as { id?: string; agotado_hasta?: string | null };
          if (!fila.id) return;
          setHastaPorPlato((previo) => ({ ...previo, [fila.id as string]: fila.agotado_hasta ?? null }));
          setAhora(Date.now());
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(canal);
    };
  }, [restaurantId]);

  const consulta = useMemo<Consulta>(
    () => (dishId) => estaAgotado(hastaPorPlato[dishId], ahora),
    [hastaPorPlato, ahora]
  );

  return <AgotadosContext.Provider value={consulta}>{children}</AgotadosContext.Provider>;
}

export function useAgotado(dishId: string): boolean {
  return useContext(AgotadosContext)(dishId);
}
