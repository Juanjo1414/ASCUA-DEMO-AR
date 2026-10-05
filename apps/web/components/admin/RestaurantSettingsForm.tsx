'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, Check, Globe, Loader2, Lock } from 'lucide-react';
import { createBrowserClient } from '@/lib/supabase/browser-client';
import { slugify, generateShortId } from '@/lib/restaurant-slug';
import { logError } from '@/lib/errors';
import { requestMenuRevalidationNow } from '@/lib/request-menu-revalidation';
import type { Database } from '@menu-ar/db';

type Restaurant = Database['public']['Tables']['restaurants']['Row'];
type Status = 'idle' | 'saving' | 'saved' | 'error';

const CURRENCIES = [
  { code: 'COP', label: 'COP — Peso colombiano' },
  { code: 'USD', label: 'USD — Dólar' },
  { code: 'MXN', label: 'MXN — Peso mexicano' },
];

export function RestaurantSettingsForm({
  restaurant,
  ownerId,
}: {
  restaurant: Restaurant | null;
  ownerId: string;
}) {
  const router = useRouter();
  const [name, setName] = useState(restaurant?.name ?? '');
  const [logoUrl, setLogoUrl] = useState(restaurant?.logo_url ?? '');
  const [brandColor, setBrandColor] = useState(restaurant?.brand_color ?? '#111111');
  const [currency, setCurrency] = useState(restaurant?.currency ?? 'COP');
  const [isPublished, setIsPublished] = useState(restaurant?.is_published ?? false);
  const [status, setStatus] = useState<Status>('idle');

  useEffect(() => {
    if (status !== 'saved') return;
    const timer = setTimeout(() => setStatus('idle'), 2500);
    return () => clearTimeout(timer);
  }, [status]);

  const save = async (publish: boolean) => {
    setStatus('saving');
    const supabase = createBrowserClient();

    const { error } = restaurant
      ? await supabase
          .from('restaurants')
          .update({
            name,
            logo_url: logoUrl || null,
            brand_color: brandColor,
            currency,
            is_published: publish,
          })
          .eq('id', restaurant.id)
      : await supabase.from('restaurants').insert({
          owner_id: ownerId,
          name,
          logo_url: logoUrl || null,
          brand_color: brandColor,
          currency,
          slug: `${slugify(name)}-${generateShortId().toLowerCase()}`,
          short_id: generateShortId(),
          is_published: publish,
        });

    if (error) {
      logError(restaurant ? 'ADMIN_RESTAURANT_UPDATE_FAILED' : 'ADMIN_RESTAURANT_CREATE_FAILED', error);
      setStatus('error');
      return;
    }

    setIsPublished(publish);
    setStatus('saved');
    await requestMenuRevalidationNow();
    router.refresh();
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void save(isPublished);
  };

  return (
    <form onSubmit={handleSubmit} className="flex max-w-lg flex-col gap-8">
      <div>
        <h1 className="font-serif text-2xl font-semibold tracking-tight text-cream">
          {restaurant ? 'Mi restaurante' : 'Crea tu restaurante'}
        </h1>
        <p className="mt-1 text-sm leading-relaxed text-stone">
          {restaurant
            ? 'Los datos que ve el comensal al abrir la carta.'
            : 'Con el nombre basta para empezar; lo demás lo puedes ajustar después.'}
        </p>
      </div>

      <div className="flex flex-col gap-5">
        <div>
          <label htmlFor="restaurant-name" className="label">
            Nombre
          </label>
          <input
            id="restaurant-name"
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="La Fonda"
            className="field"
          />
        </div>

        <div>
          <label htmlFor="restaurant-logo" className="label">
            Logo (URL)
          </label>
          <input
            id="restaurant-logo"
            type="url"
            value={logoUrl}
            onChange={(event) => setLogoUrl(event.target.value)}
            placeholder="https://..."
            className="field"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="restaurant-color" className="label">
              Color de marca
            </label>
            <div className="flex items-center gap-2">
              <input
                id="restaurant-color"
                type="color"
                value={brandColor}
                onChange={(event) => setBrandColor(event.target.value)}
                className="h-10 w-12 shrink-0 cursor-pointer rounded-lg border border-copper-900/50 bg-charcoal-900 p-1"
              />
              <span className="text-sm text-stone" data-numeric>
                {brandColor.toUpperCase()}
              </span>
            </div>
          </div>

          <div>
            <label htmlFor="restaurant-currency" className="label">
              Moneda
            </label>
            <select
              id="restaurant-currency"
              value={currency}
              onChange={(event) => setCurrency(event.target.value)}
              className="field"
            >
              {CURRENCIES.map(({ code, label }) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {restaurant ? (
        <div className="flex items-start gap-3 rounded-xl border border-copper-900/40 bg-charcoal-900 p-4">
          {isPublished ? (
            <Globe size={18} strokeWidth={1.75} className="mt-0.5 shrink-0 text-ok" />
          ) : (
            <Lock size={18} strokeWidth={1.75} className="mt-0.5 shrink-0 text-stone" />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-cream">
              {isPublished ? 'La carta está publicada' : 'La carta está oculta'}
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-stone">
              {isPublished
                ? 'Cualquiera que escanee el QR puede verla.'
                : 'Nadie puede verla todavía, ni con el enlace directo.'}
            </p>
          </div>
          <button
            type="button"
            disabled={status === 'saving'}
            onClick={() => void save(!isPublished)}
            className="btn btn-ghost shrink-0"
          >
            {isPublished ? 'Ocultar' : 'Publicar'}
          </button>
        </div>
      ) : null}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={status === 'saving' || !name.trim()}
          className="btn btn-primary"
        >
          {status === 'saving' ? (
            <>
              <Loader2 size={15} strokeWidth={2} className="animate-spin" />
              Guardando
            </>
          ) : restaurant ? (
            'Guardar cambios'
          ) : (
            'Crear restaurante'
          )}
        </button>

        {status === 'saved' ? (
          <span className="flex items-center gap-1.5 text-sm text-ok">
            <Check size={15} strokeWidth={2} />
            Guardado
          </span>
        ) : null}
        {status === 'error' ? (
          <span className="flex items-center gap-1.5 text-sm text-danger">
            <AlertCircle size={15} strokeWidth={2} />
            No se pudo guardar. Intenta de nuevo.
          </span>
        ) : null}
      </div>
    </form>
  );
}
