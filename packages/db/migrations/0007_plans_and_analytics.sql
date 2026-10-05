-- Planes y analítica de la carta.
--
-- Dos cosas que van juntas a propósito: la analítica se vende como parte de
-- Growth y Business, así que quién puede verla se decide por el plan del
-- restaurante y no por un interruptor suelto que después nadie sabe quién
-- encendió.

-- ---------------------------------------------------------------------------
-- 1. Plan contratado
-- ---------------------------------------------------------------------------
-- Los límites de cada plan (cuántos platos, cuántos usuarios, si hay
-- analítica) viven en apps/web/lib/plans.ts, no acá: cambiarlos es cosa de
-- comercial y no debería exigir una migración. La base sólo guarda cuál
-- contrató este restaurante.
alter table public.restaurants
  add column if not exists plan text not null default 'starter';

alter table public.restaurants
  drop constraint if exists restaurants_plan_valido;

alter table public.restaurants
  add constraint restaurants_plan_valido
  check (plan in ('starter', 'growth', 'business'));

comment on column public.restaurants.plan is
  'Plan contratado. Los límites de cada uno están en apps/web/lib/plans.ts.';

-- ---------------------------------------------------------------------------
-- 2. Eventos de la carta
-- ---------------------------------------------------------------------------
-- Sin datos personales a propósito: ni IP, ni user agent, ni cookie de
-- seguimiento. `session_id` es un valor aleatorio que el navegador genera y
-- olvida al cerrar la pestaña — sirve para no contar diez veces a la misma
-- persona, no para reconocerla después.
--
-- Esa decisión es también comercial: analítica sin datos personales no
-- necesita banner de consentimiento en la UE, y el comensal de un restaurante
-- en Malta abre la carta sin un cartel de cookies encima.
create table if not exists public.menu_events (
  id bigint generated always as identity primary key,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  -- Nulo en 'menu_view': ese evento es de la carta entera, no de un plato.
  dish_id uuid references public.dishes(id) on delete cascade,
  type text not null,
  session_id text not null,
  created_at timestamptz not null default now()
);

alter table public.menu_events
  drop constraint if exists menu_events_type_valido;

alter table public.menu_events
  add constraint menu_events_type_valido
  check (type in ('menu_view', 'dish_view', 'view_3d', 'view_ar'));

-- Un session_id desbordado sería una vía barata de llenar la tabla.
alter table public.menu_events
  drop constraint if exists menu_events_session_id_largo;

alter table public.menu_events
  add constraint menu_events_session_id_largo
  check (char_length(session_id) between 8 and 64);

-- Las consultas del panel siempre son "este restaurante, este rango de
-- fechas"; sin este índice, cada carga leería la tabla entera.
create index if not exists menu_events_restaurant_fecha_idx
  on public.menu_events (restaurant_id, created_at desc);

-- Para el ranking de platos más vistos.
create index if not exists menu_events_restaurant_dish_idx
  on public.menu_events (restaurant_id, dish_id, type)
  where dish_id is not null;

-- ---------------------------------------------------------------------------
-- 3. Quién puede escribir y quién puede leer
-- ---------------------------------------------------------------------------
alter table public.menu_events enable row level security;

drop policy if exists "registrar evento de carta publicada" on public.menu_events;
drop policy if exists "owner lee sus eventos" on public.menu_events;

-- Escribe cualquiera —el comensal no tiene sesión—, pero sólo sobre un
-- restaurante publicado. Sin esa condición, la tabla quedaría abierta a
-- recibir filas de restaurantes que no existen o están dados de baja.
create policy "registrar evento de carta publicada" on public.menu_events
  for insert
  with check (
    exists (
      select 1 from public.restaurants r
      where r.id = menu_events.restaurant_id and r.is_published = true
    )
  );

-- Lee sólo el dueño, y sólo lo suyo.
create policy "owner lee sus eventos" on public.menu_events
  for select using (
    exists (
      select 1 from public.restaurants r
      where r.id = menu_events.restaurant_id and r.owner_id = auth.uid()
    )
  );
