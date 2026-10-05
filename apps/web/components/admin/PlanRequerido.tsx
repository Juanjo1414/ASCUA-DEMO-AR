import Link from 'next/link';
import { BarChart3 } from 'lucide-react';

/**
 * Pantalla para una sección que el plan contratado no incluye. No es un error:
 * el dueño llegó a un sitio válido, sólo que su plan no lo cubre — así que
 * explica qué se vería aquí en vez de mostrar un acceso denegado.
 */
export function PlanRequerido({
  planActual,
  titulo = 'Analítica de tu carta',
  descripcion = 'Cuántas personas abren tu carta, qué platos miran más y cuáles se quedan sin mirar. Disponible desde el plan Growth.',
}: {
  planActual: string;
  titulo?: string;
  descripcion?: string;
}) {
  return (
    <div className="mx-auto max-w-md rounded-2xl border border-copper-900/30 bg-charcoal-900 px-6 py-10 text-center">
      <BarChart3 size={24} strokeWidth={1.5} className="mx-auto text-copper-400" />

      <h1 className="mt-4 font-serif text-xl font-semibold tracking-tight text-cream">
        {titulo}
      </h1>

      <p className="mt-2.5 text-sm leading-relaxed text-stone">{descripcion}</p>

      <p className="mt-4 text-xs text-stone/70">Tu plan actual es {planActual}.</p>

      <Link
        href="/admin/mi-restaurante"
        className="mt-5 inline-flex rounded-full bg-copper-600 px-5 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-copper-500"
      >
        Ver mi plan
      </Link>
    </div>
  );
}
