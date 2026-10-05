'use client';

import { useState } from 'react';
import { AlertCircle, Check, Languages, Loader2 } from 'lucide-react';
import { createBrowserClient } from '@/lib/supabase/browser-client';
import { logError } from '@/lib/errors';
import { IDIOMAS, NOMBRE_IDIOMA, type Idioma, type LimitesPlan } from '@/lib/plans';

type Estado = 'idle' | 'guardando' | 'traduciendo' | 'listo' | 'error';

export function IdiomasForm({
  restaurantId,
  idiomaBase,
  activosIniciales,
  limites,
  cupo,
}: {
  restaurantId: string;
  idiomaBase: Idioma;
  activosIniciales: Idioma[];
  limites: LimitesPlan;
  /** Idiomas adicionales permitidos: los del plan más los activados aparte. */
  cupo: number | null;
}) {
  const [activos, setActivos] = useState<Idioma[]>(activosIniciales);
  const [estado, setEstado] = useState<Estado>('idle');
  const [mensaje, setMensaje] = useState<string | null>(null);

  const maximo = cupo;
  const sinCupo = maximo !== null && activos.length >= maximo;
  const disponibles = IDIOMAS.filter((lang) => lang !== idiomaBase);

  // Con un solo cupo, cambiar de idioma es desactivar el que está y activar
  // el otro. Nombrarlo evita que el dueño toque una casilla muerta sin saber
  // qué se lo impide.
  const ocupante = maximo === 1 && activos.length === 1 ? activos[0] : null;

  const alternar = async (lang: Idioma) => {
    const yaEsta = activos.includes(lang);
    if (!yaEsta && sinCupo) return;

    const siguiente = yaEsta ? activos.filter((l) => l !== lang) : [...activos, lang];
    setActivos(siguiente);
    setEstado('guardando');
    setMensaje(null);

    try {
      const supabase = createBrowserClient();
      const { error } = await supabase
        .from('restaurants')
        .update({ idiomas: siguiente })
        .eq('id', restaurantId);

      if (error) throw new Error(error.message);

      // Activar un idioma sin traducir la carta la dejaría en el idioma base
      // con un selector que no cambia nada: se traduce en el mismo gesto.
      if (!yaEsta) {
        setEstado('traduciendo');
        const respuesta = await fetch('/api/traducir', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lang }),
        });

        if (!respuesta.ok) {
          const cuerpo = (await respuesta.json()) as { error?: string };
          throw new Error(cuerpo.error ?? 'No se pudo traducir la carta');
        }

        const { traducidos } = (await respuesta.json()) as { traducidos: number };
        setMensaje(`${NOMBRE_IDIOMA[lang]} listo: ${traducidos} platos traducidos.`);
      } else {
        setMensaje(`${NOMBRE_IDIOMA[lang]} ya no se muestra en tu carta.`);
      }

      setEstado('listo');
    } catch (causa) {
      logError('ADMIN_IDIOMAS_FALLO', causa);
      // Se revierte la casilla: dejarla marcada haría creer que quedó activo.
      setActivos(activos);
      setEstado('error');
      setMensaje(causa instanceof Error ? causa.message : 'No se pudo guardar el cambio.');
    }
  };

  const ocupado = estado === 'guardando' || estado === 'traduciendo';

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-xl border border-copper-900/30 bg-charcoal-900 p-4">
        <p className="text-xs uppercase tracking-wide text-stone">Idioma de tu carta</p>
        <p className="mt-1.5 flex items-center gap-2 text-sm text-cream">
          <Languages size={15} strokeWidth={1.75} className="text-copper-400" />
          {NOMBRE_IDIOMA[idiomaBase]}
        </p>
        <p className="mt-2 text-xs leading-relaxed text-stone">
          Es el idioma en que escribes tus platos. Las traducciones salen de este.
        </p>
      </div>

      <div>
        <p className="text-sm font-medium text-cream">Idiomas adicionales</p>
        <p className="mt-1 text-xs leading-relaxed text-stone">
          {maximo === null
            ? 'Tu plan incluye todos los idiomas.'
            : `Tu plan ${limites.nombre} incluye ${maximo} ${maximo === 1 ? 'idioma adicional' : 'idiomas adicionales'}.`}
        </p>

        <ul className="mt-3 flex flex-col gap-2">
          {disponibles.map((lang) => {
            const activo = activos.includes(lang);
            const bloqueado = !activo && sinCupo;

            return (
              <li key={lang}>
                <label
                  className={`flex items-center gap-3 rounded-xl border p-3.5 transition-colors ${
                    bloqueado || ocupado
                      ? 'cursor-not-allowed border-copper-900/20 opacity-50'
                      : 'cursor-pointer border-copper-900/40 hover:border-copper-500'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={activo}
                    disabled={bloqueado || ocupado}
                    onChange={() => void alternar(lang)}
                    className="h-4 w-4 shrink-0 accent-copper-600"
                  />
                  <span className="text-sm text-cream">{NOMBRE_IDIOMA[lang]}</span>
                  {bloqueado ? (
                    <span className="ml-auto text-right text-xs leading-snug text-stone">
                      {ocupante
                        ? `Desactiva ${NOMBRE_IDIOMA[ocupante]} para elegir este`
                        : 'Requiere plan superior'}
                    </span>
                  ) : null}
                </label>
              </li>
            );
          })}
        </ul>
      </div>

      {estado === 'traduciendo' ? (
        <p className="flex items-center gap-2 text-sm text-stone">
          <Loader2 size={15} strokeWidth={2} className="animate-spin text-copper-400" />
          Traduciendo tu carta…
        </p>
      ) : null}

      {estado === 'listo' && mensaje ? (
        <p className="flex items-center gap-2 text-sm text-ok">
          <Check size={15} strokeWidth={2} />
          {mensaje}
        </p>
      ) : null}

      {estado === 'error' && mensaje ? (
        <p className="flex items-start gap-2 text-sm text-danger">
          <AlertCircle size={15} strokeWidth={2} className="mt-0.5 shrink-0" />
          {mensaje}
        </p>
      ) : null}
    </div>
  );
}
