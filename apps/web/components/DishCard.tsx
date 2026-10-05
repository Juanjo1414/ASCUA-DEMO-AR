'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Box, Scan } from 'lucide-react';
import type { Database } from '@menu-ar/db';
import { DishArModal } from './DishArModal';
import { launchAr } from '@/lib/launch-ar';
import { registrarEvento } from '@/lib/analytics';
import { formatPriceCOP } from '@/lib/format-price';
import { useAgotado } from './AgotadosProvider';

type Dish = Pick<
  Database['public']['Tables']['dishes']['Row'],
  'name' | 'description' | 'price_cents' | 'photo_url'
>;

type DishAsset = Pick<
  Database['public']['Tables']['dish_assets']['Row'],
  'glb_url' | 'usdz_url' | 'poster_url'
>;

export function DishCard({
  dish,
  arAsset = null,
  priority = false,
  restaurantId,
  dishId,
  textoVer3d,
  textoVerAr,
  textoCerrar,
  textoAviso,
  textoAgotado,
}: {
  dish: Dish;
  arAsset?: DishAsset | null;
  priority?: boolean;
  restaurantId: string;
  dishId: string;
  textoVer3d: string;
  textoVerAr: string;
  textoCerrar: string;
  textoAviso: string;
  textoAgotado: string;
}) {
  const [modal, setModal] = useState<'3d' | 'ar' | null>(null);
  // Se sigue pudiendo ver en 3D y RA: el plato existe, sólo que hoy no hay.
  const agotado = useAgotado(dishId);

  // Sólo se ofrece AR cuando hay un dish_assets is_active=true con glb y
  // poster; sin poster no hay ni siquiera el botón.
  const arModel =
    arAsset && arAsset.glb_url && arAsset.poster_url
      ? { glbUrl: arAsset.glb_url, usdzUrl: arAsset.usdz_url, posterUrl: arAsset.poster_url }
      : null;

  // El toque en el botón es el gesto de usuario que Quick Look y Scene Viewer
  // exigen, así que la RA se lanza aquí mismo. Si el aparato no tiene ninguna
  // de las dos vías —un escritorio, por ejemplo— se cae al visor 3D, que ya
  // explica por qué no hay RA.
  const handleAr = () => {
    if (!arModel) return;
    registrarEvento(restaurantId, 'view_ar', dishId);
    const opened = launchAr({
      glbUrl: arModel.glbUrl,
      usdzUrl: arModel.usdzUrl,
      posterUrl: arModel.posterUrl,
      title: dish.name,
    });
    if (!opened) setModal('ar');
  };

  return (
    <>
      <article className="group overflow-hidden rounded-2xl border border-copper-900/30 bg-charcoal-900 transition-colors hover:border-copper-900/60">
        <div className="relative aspect-[4/3] w-full overflow-hidden bg-charcoal-850">
          {dish.photo_url ? (
            <Image
              src={dish.photo_url}
              alt={dish.name}
              fill
              sizes="(max-width: 640px) 100vw, 400px"
              priority={priority}
              className={`object-cover transition duration-500 group-hover:scale-[1.03] ${
                agotado ? 'grayscale' : ''
              }`}
            />
          ) : null}
          {agotado ? (
            <span className="absolute left-3 top-3 rounded-full bg-charcoal-950/85 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-cream ring-1 ring-copper-500/60 backdrop-blur-sm">
              {textoAgotado}
            </span>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5 p-4">
          <h3 className="font-serif text-base font-semibold tracking-tight text-cream">{dish.name}</h3>
          {dish.description ? (
            <p className="text-sm leading-relaxed text-stone">{dish.description}</p>
          ) : null}
          <p className="mt-1 text-sm font-medium text-copper-300">{formatPriceCOP(dish.price_cents)}</p>

          {arModel ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  registrarEvento(restaurantId, 'view_3d', dishId);
                  setModal('3d');
                }}
                className="inline-flex items-center gap-1.5 rounded-full border border-copper-900/50 px-3 py-1.5 text-xs font-medium text-cream transition-colors hover:border-copper-500 hover:bg-copper-600 hover:text-ink"
              >
                <Box size={13} strokeWidth={2} />
                {textoVer3d}
              </button>
              <button
                type="button"
                onClick={handleAr}
                className="inline-flex items-center gap-1.5 rounded-full bg-copper-600 px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-copper-500"
              >
                <Scan size={13} strokeWidth={2} />
                {textoVerAr}
              </button>
            </div>
          ) : null}
        </div>
      </article>

      {modal && arModel ? (
        <DishArModal
          name={dish.name}
          description={dish.description}
          glbUrl={arModel.glbUrl}
          posterUrl={arModel.posterUrl}
          mode={modal}
          textoCerrar={textoCerrar}
          textoAviso={textoAviso}
          onClose={() => setModal(null)}
        />
      ) : null}
    </>
  );
}
