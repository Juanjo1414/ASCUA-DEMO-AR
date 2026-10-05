import { redirect } from 'next/navigation';
import { BarChart3, Box, Eye, Scan, Users } from 'lucide-react';
import { createServerSessionClient } from '@/lib/supabase/server-session-client';
import { obtenerResumen, DIAS_POR_DEFECTO } from '@/lib/analytics-queries';
import { limitesDe } from '@/lib/plans';
import { PlanRequerido } from '@/components/admin/PlanRequerido';

export const dynamic = 'force-dynamic';

export default async function AnaliticaPage() {
  const supabase = await createServerSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/admin/login');

  const { data: restaurant } = await supabase
    .from('restaurants')
    .select('id, plan')
    .eq('owner_id', user.id)
    .maybeSingle();

  if (!restaurant) redirect('/admin/mi-restaurante');

  const limites = limitesDe(restaurant.plan);
  if (!limites.analitica) {
    return <PlanRequerido planActual={limites.nombre} />;
  }

  const resumen = await obtenerResumen(restaurant.id);

  const tarjetas = [
    { etiqueta: 'Vistas de la carta', valor: resumen.vistasCarta, icono: Eye },
    { etiqueta: 'Comensales distintos', valor: resumen.visitantes, icono: Users },
    { etiqueta: 'Platos vistos en 3D', valor: resumen.aperturas3d, icono: Box },
    { etiqueta: 'Platos vistos en RA', valor: resumen.aperturasAr, icono: Scan },
  ];

  const maximo = resumen.platos[0]?.total ?? 0;

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="font-serif text-2xl font-semibold tracking-tight text-cream">Analítica</h1>
        <p className="mt-1 text-sm text-stone">
          Últimos {DIAS_POR_DEFECTO} días. Sin datos personales de tus comensales.
        </p>
      </header>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tarjetas.map(({ etiqueta, valor, icono: Icono }) => (
          <div
            key={etiqueta}
            className="rounded-xl border border-copper-900/30 bg-charcoal-900 p-4"
          >
            <Icono size={16} strokeWidth={1.75} className="text-copper-400" />
            <p className="mt-2.5 font-serif text-2xl font-semibold text-cream">{valor}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-stone">{etiqueta}</p>
          </div>
        ))}
      </section>

      <section>
        <h2 className="font-serif text-lg font-semibold tracking-tight text-cream">
          Platos más mirados
        </h2>

        {resumen.platos.length === 0 ? (
          <div className="mt-3 rounded-xl border border-copper-900/30 bg-charcoal-900 px-5 py-8 text-center">
            <BarChart3 size={22} strokeWidth={1.5} className="mx-auto text-stone/50" />
            <p className="mt-3 text-sm text-stone">
              Todavía nadie ha abierto un plato en 3D o en realidad aumentada.
            </p>
            <p className="mt-1 text-xs text-stone/70">
              Los números aparecen aquí en cuanto tus comensales empiecen a escanear el QR.
            </p>
          </div>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {resumen.platos.map((plato) => (
              <li
                key={plato.dishId}
                className="rounded-xl border border-copper-900/30 bg-charcoal-900 p-4"
              >
                <div className="flex items-baseline justify-between gap-4">
                  <p className="text-sm font-medium text-cream">{plato.nombre}</p>
                  <p className="shrink-0 text-sm font-medium text-copper-300">{plato.total}</p>
                </div>

                {/* Barra relativa al plato más visto: lo que importa es la
                    comparación entre platos, no el número absoluto. */}
                <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-charcoal-800">
                  <div
                    className="h-full rounded-full bg-copper-600"
                    style={{ width: `${maximo > 0 ? (plato.total / maximo) * 100 : 0}%` }}
                  />
                </div>

                <p className="mt-2 text-xs text-stone">
                  {plato.vistas3d} en 3D · {plato.vistasAr} en realidad aumentada
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
