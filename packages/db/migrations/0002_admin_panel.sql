-- Fase 4 — lo que necesita el panel para funcionar con el cliente de
-- navegador (anon key + sesión del dueño), más los dos requisitos legales
-- de la sección 3 del plan.

-- `categories` había quedado sin RLS en la migración 0001 (se activó en
-- restaurants/dishes/dish_assets/jobs pero no aquí). Sin esto, cualquier
-- usuario autenticado podría leer o escribir categorías de cualquier
-- restaurante.
alter table categories enable row level security;

create policy "owner categories" on categories
  for all using (
    exists (select 1 from restaurants r
            where r.id = categories.restaurant_id and r.owner_id = auth.uid())
  );

-- dish_assets y jobs tenían RLS activado desde la 0001 pero ninguna
-- política: sin esto, el panel no puede ni leer el estado de un job ni
-- aprobar un modelo 3D.
create policy "owner dish_assets" on dish_assets
  for all using (
    exists (select 1 from dishes d
            join restaurants r on r.id = d.restaurant_id
            where d.id = dish_assets.dish_id and r.owner_id = auth.uid())
  );

create policy "owner jobs" on jobs
  for all using (
    exists (select 1 from restaurants r
            where r.id = jobs.restaurant_id and r.owner_id = auth.uid())
  );

-- Garantía de titularidad de las fotos (Fase 4): casilla obligatoria la
-- primera vez que el restaurante sube una foto. Se guarda quién y cuándo.
alter table restaurants
  add column photo_rights_accepted_by uuid references auth.users(id),
  add column photo_rights_accepted_at timestamptz;

-- Aprobación explícita del modelo 3D (Fase 4 y 5): ningún .glb se publica
-- solo. El clic de aprobación queda registrado acá; es la evidencia si
-- alguien reclama que el plato no se parecía al 3D (sección 6.4).
create table audit_log (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  actor_id      uuid references auth.users(id),
  action        text not null,           -- 'dish_asset_approved' | 'photo_rights_accepted' | ...
  entity_type   text not null,           -- 'dish_assets' | 'restaurants' | ...
  entity_id     uuid,
  metadata      jsonb,
  created_at    timestamptz default now()
);

alter table audit_log enable row level security;

create policy "owner audit_log" on audit_log
  for all using (
    exists (select 1 from restaurants r
            where r.id = audit_log.restaurant_id and r.owner_id = auth.uid())
  );

-- Bucket de Storage para las fotos que sube el dueño desde "Capturar
-- plato". Lectura pública (el menú público las muestra sin sesión);
-- escritura solo dentro de la carpeta que empieza con el propio user id.
insert into storage.buckets (id, name, public)
values ('dish-photos', 'dish-photos', true)
on conflict (id) do nothing;

create policy "public read dish photos" on storage.objects
  for select using (bucket_id = 'dish-photos');

create policy "owner upload dish photos" on storage.objects
  for insert with check (
    bucket_id = 'dish-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
