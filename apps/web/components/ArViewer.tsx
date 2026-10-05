'use client';

import { useEffect, useRef, useState } from 'react';

// Visor 3D puro: la realidad aumentada ya no sale de aquí sino del botón de la
// tarjeta, que llama a Quick Look o Scene Viewer directo (ver lib/launch-ar.ts).
// activateAR() sólo corre dentro de un gesto del usuario, y para cuando el
// modelo termina de cargar el toque que abrió el visor ya expiró — por eso
// hacerlo desde acá obligaba a un segundo toque.
//
// Los atributos se ponen por setAttribute y no por JSX: React asigna a los
// custom elements por propiedad cuando esa propiedad existe, y un `algo=""`
// termina como propiedad vacía —falsy— en vez de atributo presente.
const VIEWER_ATTRS: Record<string, string> = {
  'camera-controls': '',
  'touch-action': 'pan-y',
  'shadow-intensity': '1',
};

export function ArViewer({ glb, poster, alt }: { glb: string; poster: string; alt: string }) {
  const viewerRef = useRef<HTMLElement | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // ~150 KB, sólo cuando el comensal pide ver el plato.
    import('@google/model-viewer').then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const viewer = viewerRef.current;
    if (!viewer) return;

    for (const [name, value] of Object.entries(VIEWER_ATTRS)) {
      viewer.setAttribute(name, value);
    }
    viewer.setAttribute('src', glb);
    if (poster) viewer.setAttribute('poster', poster);
    if (alt) viewer.setAttribute('alt', alt);
  }, [ready, glb, poster, alt]);

  if (!ready) {
    return (
      <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-charcoal-800">
        {/* eslint-disable-next-line @next/next/no-img-element -- poster liviano mientras carga el visor */}
        <img src={poster} alt={alt} className="h-full w-full object-cover opacity-40" />
        <div className="absolute inset-0 grid place-items-center">
          <div className="flex gap-2">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="h-1.5 w-1.5 animate-pulse rounded-full bg-copper-500"
                style={{ animationDelay: `${i * 150}ms` }}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <model-viewer
      ref={viewerRef as React.Ref<HTMLElement>}
      className="aspect-square w-full rounded-2xl bg-charcoal-800"
    />
  );
}
