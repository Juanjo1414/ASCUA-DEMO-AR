'use client';

import { useEffect, useState } from 'react';

// Barra de categorías pegada arriba. Marca la sección visible mientras el
// comensal baja: en una carta larga, sin esa señal se pierde la referencia de
// en qué parte del menú está.
export function CategoryNav({ categories }: { categories: Array<{ id: string; name: string }> }) {
  const [activa, setActiva] = useState(categories[0]?.id ?? null);

  useEffect(() => {
    const secciones = categories
      .map(({ id }) => document.getElementById(`categoria-${id}`))
      .filter((el): el is HTMLElement => el !== null);

    if (secciones.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // La que esté más arriba dentro de la franja observada gana: con
        // varias visibles a la vez, la primera es la que el comensal lee.
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActiva(visible.target.id.replace('categoria-', ''));
      },
      { rootMargin: '-80px 0px -70% 0px', threshold: 0 }
    );

    for (const seccion of secciones) observer.observe(seccion);
    return () => observer.disconnect();
  }, [categories]);

  return (
    <nav className="sticky top-0 z-20 border-b border-copper-900/30 bg-charcoal-950/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-3xl gap-2 overflow-x-auto px-5 py-3">
        {categories.map((category) => {
          const esActiva = category.id === activa;
          return (
            <a
              key={category.id}
              href={`#categoria-${category.id}`}
              aria-current={esActiva ? 'true' : undefined}
              className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm transition-colors ${
                esActiva
                  ? 'bg-copper-600 font-medium text-ink'
                  : 'border border-copper-900/40 text-stone hover:border-copper-500 hover:text-cream'
              }`}
            >
              {category.name}
            </a>
          );
        })}
      </div>
    </nav>
  );
}
