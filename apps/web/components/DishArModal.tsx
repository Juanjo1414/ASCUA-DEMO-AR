'use client';

import { useEffect, useState } from 'react';
import { Check, Copy, X } from 'lucide-react';
import { ArViewer } from './ArViewer';
import { detectInAppBrowser } from '@/lib/browser-env';

interface DishArModalProps {
  name: string;
  description: string | null;
  glbUrl: string;
  posterUrl: string;
  /** 'ar' sólo llega aquí cuando no hubo vía nativa: entonces se explica por qué. */
  mode: '3d' | 'ar';
  textoCerrar: string;
  textoAviso: string;
  onClose: () => void;
}

export function DishArModal({
  name,
  description,
  glbUrl,
  posterUrl,
  mode,
  textoCerrar,
  textoAviso,
  onClose,
}: DishArModalProps) {
  const [copied, setCopied] = useState(false);
  // Se calcula una vez: el user agent no cambia mientras el modal vive.
  const [inAppName] = useState(() => detectInAppBrowser());
  const arUnavailable = mode === 'ar';

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Sin permiso de portapapeles no hay alternativa silenciosa: el comensal
      // todavía puede copiar la URL desde la barra de direcciones.
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={name}
      onClick={onClose}
      className="fixed inset-0 z-[90] flex items-center justify-center bg-charcoal-950/90 p-4 backdrop-blur-sm"
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-copper-900/40 bg-charcoal-900 p-6"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label={textoCerrar}
          className="absolute right-4 top-4 z-10 grid h-9 w-9 place-items-center rounded-full border border-copper-900/50 bg-charcoal-800/80 text-cream transition-colors hover:bg-copper-600 hover:text-ink"
        >
          <X size={18} strokeWidth={2} />
        </button>

        <ArViewer glb={glbUrl} poster={posterUrl} alt={name} />

        <div className="mt-5">
          <p className="font-serif text-lg font-semibold tracking-tight text-cream">{name}</p>
          {description ? <p className="mt-1 text-sm text-stone">{description}</p> : null}

          {arUnavailable ? (
            <div className="mt-3 rounded-xl border border-copper-900/50 bg-charcoal-800 px-4 py-3">
              {inAppName ? (
                <>
                  <p className="text-xs font-medium text-cream">Abre esta página en el navegador</p>
                  <p className="mt-1.5 text-xs leading-relaxed text-stone">
                    Estás viendo la carta dentro de {inAppName}, y esos navegadores no pueden abrir
                    la realidad aumentada. Toca el menú de {inAppName} y elige «Abrir en Safari» o
                    «Abrir en Chrome».
                  </p>
                  <button
                    type="button"
                    onClick={copyLink}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-copper-900/60 px-3 py-1.5 text-xs text-cream transition-colors hover:bg-copper-600 hover:text-ink"
                  >
                    {copied ? <Check size={13} strokeWidth={2} /> : <Copy size={13} strokeWidth={2} />}
                    {copied ? 'Enlace copiado' : 'Copiar enlace'}
                  </button>
                </>
              ) : (
                <p className="text-xs leading-relaxed text-stone">
                  Tu dispositivo o navegador no permite abrir la realidad aumentada. Ábrela desde el
                  celular (Chrome en Android o Safari en iPhone) para verla sobre tu mesa.
                </p>
              )}
            </div>
          ) : null}

          {/* Ley 1480 de 2011: el modelo es publicidad, no la presentación exacta. */}
          <p className="mt-3 text-xs text-stone/70">{textoAviso}</p>
        </div>
      </div>
    </div>
  );
}
