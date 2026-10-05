'use client';

import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  ArrowLeft,
  Camera,
  Check,
  CircleCheck,
  Loader2,
  Sparkles,
} from 'lucide-react';
import { createBrowserClient } from '@/lib/supabase/browser-client';
import { logError } from '@/lib/errors';
import { requestMenuRevalidationNow } from '@/lib/request-menu-revalidation';
import { ArViewer } from '@/components/ArViewer';
import type { Database } from '@menu-ar/db';

type Dish = Database['public']['Tables']['dishes']['Row'];
type Category = Database['public']['Tables']['categories']['Row'];
type DishAsset = Database['public']['Tables']['dish_assets']['Row'];
type Job = Database['public']['Tables']['jobs']['Row'];

const CAPTURE_GUIDE = [
  'Fondo liso y contrastante (mantel blanco, mesa oscura).',
  'Luz difusa, sin flash directo ni sombras duras.',
  'Ángulo de 30-45°, el plato ocupando el 80% del encuadre.',
  'Nada más en cuadro: ni cubiertos, ni manos, ni vasos.',
];

// Modo demo: en presentaciones comerciales el worker no corre, así que la
// captura se deshabilita para que nadie encole un trabajo que se quedaría en
// 'queued' para siempre. Se apaga quitando NEXT_PUBLIC_DEMO_MODE.
const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

const JOB_STATUS_LABEL: Record<Job['status'], string> = {
  queued: 'En cola',
  processing: 'Generando',
  done: 'Listo',
  failed: 'Falló',
};

export function DishDetailForm({
  dish,
  categories,
  assets,
  latestJob,
  photoRightsAcceptedAt,
  ownerId,
}: {
  dish: Dish;
  categories: Category[];
  assets: DishAsset[];
  latestJob: Job | null;
  photoRightsAcceptedAt: string | null;
  ownerId: string;
}) {
  const router = useRouter();
  const [supabase] = useState(() => createBrowserClient());

  const [name, setName] = useState(dish.name);
  const [description, setDescription] = useState(dish.description ?? '');
  const [price, setPrice] = useState(dish.price_cents / 100);
  const [categoryId, setCategoryId] = useState(dish.category_id ?? '');
  const [isAvailable, setIsAvailable] = useState(dish.is_available);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const [rightsAccepted, setRightsAccepted] = useState(photoRightsAcceptedAt !== null);
  const [rightsRecorded, setRightsRecorded] = useState(photoRightsAcceptedAt !== null);
  const [job, setJob] = useState(latestJob);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'error'>('idle');
  const [approving, setApproving] = useState(false);

  const activeAsset = assets.find((asset) => asset.is_active) ?? null;
  const pendingAsset =
    assets.find((asset) => !asset.is_active && asset.id !== activeAsset?.id) ?? null;
  const isGenerating = job?.status === 'queued' || job?.status === 'processing';

  // El mensaje de "guardado" se apaga solo: si se queda fijo deja de
  // significar algo la próxima vez que el dueño toque el formulario.
  useEffect(() => {
    if (saveStatus !== 'saved') return;
    const timer = setTimeout(() => setSaveStatus('idle'), 2500);
    return () => clearTimeout(timer);
  }, [saveStatus]);

  useEffect(() => {
    if (!job || (job.status !== 'queued' && job.status !== 'processing')) return;

    const interval = setInterval(async () => {
      const { data } = await supabase.from('jobs').select('*').eq('id', job.id).single();
      if (data) setJob(data);
      if (data && (data.status === 'done' || data.status === 'failed')) {
        router.refresh();
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [job, supabase, router]);

  const handleSaveDetails = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaveStatus('saving');

    const { error } = await supabase
      .from('dishes')
      .update({
        name,
        description: description || null,
        price_cents: Math.round(price * 100),
        category_id: categoryId || null,
        is_available: isAvailable,
      })
      .eq('id', dish.id);

    if (error) logError('ADMIN_DISH_SAVE_FAILED', error);
    setSaveStatus(error ? 'error' : 'saved');
    if (!error) {
      await requestMenuRevalidationNow();
      router.refresh();
    }
  };

  const handleCapture = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = ''; // permite volver a elegir el mismo archivo después
    if (!file || !rightsAccepted) return;

    setUploadStatus('uploading');

    if (!rightsRecorded) {
      const { error: rightsError } = await supabase
        .from('restaurants')
        .update({
          photo_rights_accepted_by: ownerId,
          photo_rights_accepted_at: new Date().toISOString(),
        })
        .eq('id', dish.restaurant_id);
      if (rightsError) logError('ADMIN_DISH_RIGHTS_ACCEPT_FAILED', rightsError);

      const { error: auditError } = await supabase.from('audit_log').insert({
        restaurant_id: dish.restaurant_id,
        actor_id: ownerId,
        action: 'photo_rights_accepted',
        entity_type: 'restaurants',
        entity_id: dish.restaurant_id,
      });
      if (auditError) logError('ADMIN_DISH_RIGHTS_AUDIT_LOG_FAILED', auditError);

      setRightsRecorded(true);
    }

    const path = `${ownerId}/${dish.id}-${Date.now()}.jpg`;
    const { error: uploadError } = await supabase.storage
      .from('dish-photos')
      .upload(path, file, { contentType: file.type });

    if (uploadError) {
      logError('ADMIN_DISH_PHOTO_UPLOAD_FAILED', uploadError);
      setUploadStatus('error');
      return;
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from('dish-photos').getPublicUrl(path);

    const { error: photoUrlError } = await supabase
      .from('dishes')
      .update({ photo_url: publicUrl })
      .eq('id', dish.id);
    if (photoUrlError) logError('ADMIN_DISH_PHOTO_URL_SAVE_FAILED', photoUrlError);

    const response = await fetch('/api/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dishId: dish.id, sourcePhoto: publicUrl }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      logError('ADMIN_DISH_ENQUEUE_JOB_FAILED', body ?? `HTTP ${response.status}`);
      setUploadStatus('error');
      return;
    }

    const { job: newJob } = (await response.json()) as { job: Job };
    setJob(newJob);
    setUploadStatus('idle');
    router.refresh();
  };

  const handleApprove = async () => {
    if (!pendingAsset) return;
    setApproving(true);

    if (activeAsset) {
      const { error } = await supabase
        .from('dish_assets')
        .update({ is_active: false })
        .eq('id', activeAsset.id);
      if (error) logError('ADMIN_DISH_ASSET_DEACTIVATE_FAILED', error);
    }

    const { error: activateError } = await supabase
      .from('dish_assets')
      .update({ is_active: true })
      .eq('id', pendingAsset.id);
    if (activateError) logError('ADMIN_DISH_ASSET_ACTIVATE_FAILED', activateError);

    const { error: auditError } = await supabase.from('audit_log').insert({
      restaurant_id: dish.restaurant_id,
      actor_id: ownerId,
      action: 'dish_asset_approved',
      entity_type: 'dish_assets',
      entity_id: pendingAsset.id,
    });
    if (auditError) logError('ADMIN_DISH_ASSET_APPROVE_AUDIT_LOG_FAILED', auditError);

    // Publicar es justo el momento en que el dueño va a abrir su carta
    // para ver el modelo: si no se refresca aquí, no lo encuentra.
    await requestMenuRevalidationNow();

    setApproving(false);
    router.refresh();
  };

  // El código entre corchetes que guarda index.ts en jobs.error es para
  // developer, no para el dueño del restaurante — se lo saco antes de
  // mostrárselo.
  const jobErrorMessage = job?.error?.replace(/^\[[^\]]+\]\s*/, '') ?? null;

  return (
    <div className="flex flex-col gap-10">
      <div>
        <Link
          href="/admin/menu"
          className="inline-flex items-center gap-1.5 text-sm text-stone transition-colors hover:text-cream"
        >
          <ArrowLeft size={15} strokeWidth={1.75} />
          Menú
        </Link>
        <h1 className="mt-3 font-serif text-2xl font-semibold tracking-tight text-cream">
          {dish.name}
        </h1>
      </div>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <form onSubmit={handleSaveDetails} className="flex flex-col gap-5">
          <div>
            <label htmlFor="dish-name" className="label">
              Nombre
            </label>
            <input
              id="dish-name"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="field"
            />
          </div>

          <div>
            <label htmlFor="dish-description" className="label">
              Descripción
            </label>
            <textarea
              id="dish-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              placeholder="Los ingredientes principales, como los diría un mesero."
              className="field resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="dish-price" className="label">
                Precio (COP)
              </label>
              <input
                id="dish-price"
                type="number"
                min={0}
                value={price}
                onChange={(event) => setPrice(Number(event.target.value))}
                className="field text-right"
              />
            </div>

            <div>
              <label htmlFor="dish-category" className="label">
                Categoría
              </label>
              <select
                id="dish-category"
                value={categoryId}
                onChange={(event) => setCategoryId(event.target.value)}
                className="field"
              >
                <option value="">Sin categoría</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <label className="flex cursor-pointer items-start gap-2.5 text-sm text-cream">
            <input
              type="checkbox"
              checked={isAvailable}
              onChange={(event) => setIsAvailable(event.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-copper-600"
            />
            <span>
              Mostrar en la carta
              <span className="mt-0.5 block text-xs leading-relaxed text-stone">
                {isAvailable
                  ? 'El comensal lo ve al escanear el QR.'
                  : 'Retirado de la carta. El plato y su modelo se conservan.'}
              </span>
            </span>
          </label>

          <div className="flex items-center gap-3">
            <button type="submit" disabled={saveStatus === 'saving'} className="btn btn-primary">
              {saveStatus === 'saving' ? (
                <>
                  <Loader2 size={15} strokeWidth={2} className="animate-spin" />
                  Guardando
                </>
              ) : (
                'Guardar cambios'
              )}
            </button>

            {saveStatus === 'saved' ? (
              <span className="flex items-center gap-1.5 text-sm text-ok">
                <Check size={15} strokeWidth={2} />
                Guardado
              </span>
            ) : null}
            {saveStatus === 'error' ? (
              <span className="flex items-center gap-1.5 text-sm text-danger">
                <AlertCircle size={15} strokeWidth={2} />
                No se pudo guardar. Intenta de nuevo.
              </span>
            ) : null}
          </div>
        </form>

        <section className="flex flex-col gap-4">
          <div>
            <h2 className="font-serif text-lg font-semibold tracking-tight text-cream">Modelo 3D</h2>
            <p className="mt-1 text-sm leading-relaxed text-stone">
              Toma la foto del plato y el modelo se genera solo. Cuando esté listo lo revisas antes
              de que salga en la carta.
            </p>
          </div>

          {/* Primero el que espera aprobación: es la decisión pendiente, y
              hay que poder girarlo antes de publicarlo a los comensales. */}
          {pendingAsset?.glb_url && pendingAsset.poster_url ? (
            <div className="rounded-xl border border-warn/50 bg-warn-soft p-3">
              <div className="mb-3 flex items-center gap-2">
                <p className="flex-1 text-sm font-medium text-cream">Modelo nuevo listo</p>
                <p className="text-xs text-stone">
                  {activeAsset ? 'Reemplaza al publicado' : 'Sin publicar'}
                </p>
              </div>

              <ArViewer
                glb={pendingAsset.glb_url}
                poster={pendingAsset.poster_url}
                alt={`Modelo nuevo de ${dish.name}`}
              />

              <p className="mt-2 text-xs leading-relaxed text-stone">
                Gíralo antes de aprobarlo. Desde el celular puedes verlo sobre una mesa real.
              </p>

              <button
                type="button"
                onClick={() => void handleApprove()}
                disabled={approving}
                className="btn btn-primary mt-3 w-full"
              >
                {approving ? (
                  <>
                    <Loader2 size={15} strokeWidth={2} className="animate-spin" />
                    Publicando
                  </>
                ) : (
                  'Aprobar y publicar'
                )}
              </button>
            </div>
          ) : null}

          {activeAsset?.glb_url && activeAsset.poster_url ? (
            <div className="rounded-xl border border-copper-900/50 bg-charcoal-900 p-3">
              <div className="mb-3 flex items-center gap-2">
                <p className="flex flex-1 items-center gap-1.5 text-sm font-medium text-ok">
                  <CircleCheck size={15} strokeWidth={2} />
                  Publicado en la carta
                </p>
                {activeAsset.bytes_glb ? (
                  <p className="text-xs text-stone" data-numeric>
                    {(activeAsset.bytes_glb / 1048576).toFixed(1)} MB
                    {activeAsset.triangles
                      ? ` · ${activeAsset.triangles.toLocaleString('es-CO')} tri`
                      : ''}
                  </p>
                ) : null}
              </div>

              <ArViewer
                glb={activeAsset.glb_url}
                poster={activeAsset.poster_url}
                alt={`Modelo de ${dish.name}`}
              />
            </div>
          ) : null}

          {isGenerating ? (
            <div className="rounded-xl border border-copper-900/50 bg-charcoal-900 p-4">
              <p className="flex items-center gap-2 text-sm text-cream">
                <Loader2 size={15} strokeWidth={2} className="animate-spin text-copper-400" />
                {JOB_STATUS_LABEL[job.status]}
              </p>
              <p className="mt-1.5 text-xs leading-relaxed text-stone">
                Suele tardar unos minutos. Puedes cerrar esta página y volver después.
              </p>
              <div className="mt-3 h-1 overflow-hidden rounded-full bg-charcoal-700">
                <div className="h-full w-1/3 animate-pulse rounded-full bg-copper-600" />
              </div>
            </div>
          ) : null}

          {job?.status === 'failed' ? (
            <div className="rounded-xl border border-danger/50 bg-danger-soft p-4">
              <p className="flex items-center gap-2 text-sm font-medium text-danger">
                <AlertCircle size={15} strokeWidth={2} />
                No se pudo generar el modelo
              </p>
              <p className="mt-1.5 text-xs leading-relaxed text-stone">
                {jobErrorMessage ?? 'Ocurrió un error durante la generación.'} Vuelve a tomar la
                foto siguiendo las recomendaciones de abajo.
              </p>
            </div>
          ) : null}

          {!activeAsset && !pendingAsset && !isGenerating && job?.status !== 'failed' ? (
            <p className="rounded-xl border border-dashed border-copper-900/40 px-4 py-6 text-center text-sm text-stone">
              Este plato todavía no tiene modelo 3D.
            </p>
          ) : null}

          {DEMO_MODE ? (
            <div className="flex flex-col gap-2 rounded-xl border border-copper-900/40 bg-charcoal-900 p-5">
              <div className="flex items-center gap-2">
                <Sparkles size={18} strokeWidth={1.75} className="shrink-0 text-copper-400" />
                <p className="text-sm font-medium text-cream">
                  Generación de modelos 3D
                </p>
              </div>
              <p className="text-xs leading-relaxed text-stone">
                Incluida al contratar el servicio. Usted envía las fotos de sus platos y
                nosotros entregamos los modelos listos para publicar.
              </p>
              <p className="text-xs leading-relaxed text-stone">
                En esta demostración la captura está desactivada. Los platos que ya tienen
                modelo se pueden ver y publicar con normalidad.
              </p>
            </div>
          ) : (
            <>
            {!rightsAccepted ? (
              <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-copper-900/40 bg-charcoal-900 p-3 text-xs leading-relaxed text-stone">
                <input
                  type="checkbox"
                  checked={rightsAccepted}
                  onChange={(event) => setRightsAccepted(event.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-copper-600"
                />
                Declaro que soy titular de esta imagen o cuento con autorización para usarla, y que no
                incluye personas identificables sin su consentimiento.
              </label>
            ) : null}

            <label
              className={`flex flex-col items-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors ${
                rightsAccepted && uploadStatus !== 'uploading'
                  ? 'cursor-pointer border-copper-900/60 text-cream hover:border-copper-500 hover:bg-charcoal-900'
                  : 'cursor-not-allowed border-copper-900/30 text-stone/50'
              }`}
            >
              {uploadStatus === 'uploading' ? (
                <>
                  <Loader2 size={22} strokeWidth={1.75} className="animate-spin text-copper-400" />
                  <span className="text-sm">Subiendo la foto…</span>
                </>
              ) : (
                <>
                  {activeAsset || pendingAsset ? (
                    <Sparkles size={22} strokeWidth={1.75} />
                  ) : (
                    <Camera size={22} strokeWidth={1.75} />
                  )}
                  <span className="text-sm font-medium">
                    {activeAsset || pendingAsset ? 'Generar de nuevo' : 'Tomar foto del plato'}
                  </span>
                  <span className="text-xs text-stone">
                    {rightsAccepted ? 'JPG o PNG desde la cámara o la galería' : 'Acepta la declaración de arriba'}
                  </span>
                </>
              )}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                disabled={!rightsAccepted || uploadStatus === 'uploading'}
                onChange={(event) => void handleCapture(event)}
                className="hidden"
              />
            </label>

            {uploadStatus === 'error' ? (
              <p className="flex items-center gap-1.5 text-sm text-danger">
                <AlertCircle size={15} strokeWidth={2} />
                No se pudo subir la foto. Revisa tu conexión e intenta de nuevo.
              </p>
            ) : null}

            <div className="rounded-xl border border-copper-900/30 bg-charcoal-900/60 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-stone">
                Para que salga bien
              </p>
              <ul className="mt-2.5 flex flex-col gap-1.5">
                {CAPTURE_GUIDE.map((tip) => (
                  <li key={tip} className="flex gap-2 text-xs leading-relaxed text-stone">
                    <span aria-hidden="true" className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-copper-600" />
                    {tip}
                  </li>
                ))}
              </ul>
            </div>
            </>
          )}

        </section>
      </div>
    </div>
  );
}
