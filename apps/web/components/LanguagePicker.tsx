'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Languages } from 'lucide-react';
import { NOMBRE_IDIOMA, type Idioma } from '@/lib/plans';

/**
 * Selector de idioma de la carta.
 *
 * El idioma va en la URL y no en una cookie: así el mesero puede dejar la
 * carta abierta en alemán para una mesa concreta, o compartir el enlace ya
 * traducido, y el buscador puede indexar cada versión por separado.
 */
export function LanguagePicker({
  idiomas,
  actual,
  etiqueta,
}: {
  idiomas: Idioma[];
  actual: Idioma;
  etiqueta: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Con un solo idioma no hay nada que elegir.
  if (idiomas.length < 2) return null;

  const cambiar = (lang: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('lang', lang);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  return (
    <label className="inline-flex items-center gap-2 text-stone">
      <Languages size={15} strokeWidth={1.75} aria-hidden="true" />
      <span className="sr-only">{etiqueta}</span>
      <select
        value={actual}
        onChange={(event) => cambiar(event.target.value)}
        className="cursor-pointer rounded-full border border-copper-900/40 bg-charcoal-900 px-3 py-1.5 text-xs text-cream outline-none transition-colors hover:border-copper-500 focus-visible:border-copper-500"
      >
        {idiomas.map((lang) => (
          <option key={lang} value={lang}>
            {NOMBRE_IDIOMA[lang]}
          </option>
        ))}
      </select>
    </label>
  );
}
