'use client';

import { useState } from 'react';
import { Check, Copy, ExternalLink, FileImage, FileText, Shapes } from 'lucide-react';

const FORMATS = [
  {
    format: 'pdf',
    icon: FileText,
    title: 'PDF A6',
    detail: 'Listo para imprimir y poner en la mesa',
    primary: true,
  },
  {
    format: 'png',
    icon: FileImage,
    title: 'PNG',
    detail: '1024 px, para pantallas y redes',
    primary: false,
  },
  {
    format: 'svg',
    icon: Shapes,
    title: 'SVG',
    detail: 'Vectorial, para pendones o cartas grandes',
    primary: false,
  },
] as const;

export function QrDownload({ slug, shortId }: { slug: string; shortId?: string | null }) {
  const [copied, setCopied] = useState(false);

  // El QR apunta al redirector corto (/r/{short_id}), no al menú directo:
  // así el código impreso sigue sirviendo aunque el slug cambie.
  const menuPath = shortId ? `/r/${shortId}` : `/m/${slug}`;
  const menuUrl = typeof window === 'undefined' ? menuPath : `${window.location.origin}${menuPath}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(menuUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Sin permiso de portapapeles no hay nada que hacer desde aquí: el
      // enlace igual está a la vista para copiarlo a mano.
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <div className="no-print">
        <h1 className="font-serif text-2xl font-semibold tracking-tight text-cream">Mi QR</h1>
        <p className="mt-1 max-w-md text-sm leading-relaxed text-stone">
          Este es el código que el comensal escanea para ver la carta con los platos en 3D.
        </p>
      </div>

      <div className="grid gap-8 sm:grid-cols-[auto_minmax(0,1fr)]">
        <div className="flex flex-col items-center gap-3">
          {/* Fondo blanco fijo: un QR sobre carbón no lo lee ningún teléfono. */}
          <div className="rounded-2xl bg-white p-4">
            {/* eslint-disable-next-line @next/next/no-img-element -- viene de una ruta propia, no de next/image */}
            <img
              src="/api/qr?format=png"
              alt={`Código QR de ${slug}`}
              className="h-48 w-48"
            />
          </div>
          <a
            href={menuPath}
            target="_blank"
            rel="noreferrer"
            className="no-print inline-flex items-center gap-1.5 text-xs text-stone transition-colors hover:text-copper-400"
          >
            Probar el código
            <ExternalLink size={12} strokeWidth={2} />
          </a>
        </div>

        <div className="no-print flex flex-col gap-6">
          <div>
            <p className="label">Enlace de la carta</p>
            <div className="flex gap-2">
              <input
                readOnly
                value={menuUrl}
                onFocus={(event) => event.currentTarget.select()}
                className="field flex-1 font-medium"
              />
              <button
                type="button"
                onClick={() => void handleCopy()}
                className="btn btn-ghost shrink-0"
                aria-label="Copiar enlace de la carta"
              >
                {copied ? (
                  <>
                    <Check size={15} strokeWidth={2} className="text-ok" />
                    Copiado
                  </>
                ) : (
                  <>
                    <Copy size={15} strokeWidth={2} />
                    Copiar
                  </>
                )}
              </button>
            </div>
          </div>

          <div>
            <p className="label">Descargar</p>
            <div className="flex flex-col gap-2">
              {FORMATS.map(({ format, icon: Icon, title, detail, primary }) => (
                <a
                  key={format}
                  href={`/api/qr?format=${format}`}
                  className={`flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors ${
                    primary
                      ? 'border-copper-600 bg-copper-600/10 hover:bg-copper-600/20'
                      : 'border-copper-900/50 hover:border-copper-500 hover:bg-charcoal-900'
                  }`}
                >
                  <Icon
                    size={18}
                    strokeWidth={1.75}
                    className={primary ? 'text-copper-400' : 'text-stone'}
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-cream">{title}</span>
                    <span className="block text-xs text-stone">{detail}</span>
                  </span>
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>

      <p className="no-print max-w-md text-xs leading-relaxed text-stone">
        Imprímelo a 3×3 cm como mínimo, con margen blanco alrededor y sobre un fondo que contraste.
        Si queda muy chico o sin margen, los teléfonos no lo leen.
      </p>
    </div>
  );
}
