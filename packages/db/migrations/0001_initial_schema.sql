-- Fase 1 — esquema inicial multi-tenant.
-- Fuente: sección 2 de plan-menu-ar-multirestaurante.md. Todo cuelga de
-- restaurant_id y se protege con RLS: sin esto, un restaurante ve el
-- menú de otro.

-- Restaurantes (tenants)
create table restaurants (
  id            uuid primary key default gen_random_uuid(),
  short_id      text unique not null,          -- 6 chars, para el QR: /r/{short_id}
  slug          text unique not null,          -- la-fonda-envigado
  name          text not null,
  logo_url      text,
  brand_color   text default '#111111',
  currency      text default 'COP',
  is_published  boolean default false,
  owner_id      uuid references auth.users(id),
  created_at    timestamptz default now()
);

create table categories (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  name          text not null,
  position      int  not null default 0
);

create table dishes (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  category_id   uuid references categories(id) on delete set null,
  name          text not null,
  description   text,
  price_cents   bigint not null default 0,
  photo_url     text,                          -- foto original (2D)
  position      int  not null default 0,
  is_available  boolean default true,
  updated_at    timestamptz default now()
);

-- Assets 3D: separados del plato porque tienen ciclo de vida propio
create table dish_assets (
  id            uuid primary key default gen_random_uuid(),
  dish_id       uuid not null references dishes(id) on delete cascade,
  glb_url       text,
  usdz_url      text,
  poster_url    text,                          -- webp que se ve en el menú
  triangles     int,
  bytes_glb     int,
  generator     text,                          -- 'triposr' | 'meshy'
  is_active     boolean default false,         -- permite versionar y hacer rollback
  created_at    timestamptz default now()
);

-- Cola de trabajos
create type job_status as enum ('queued','processing','done','failed');

create table jobs (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  dish_id       uuid not null references dishes(id) on delete cascade,
  source_photo  text not null,
  status        job_status not null default 'queued',
  attempts      int default 0,
  error         text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

create index on jobs (status, created_at);
create index on dishes (restaurant_id, position);

-- RLS obligatorio
alter table restaurants enable row level security;
alter table dishes enable row level security;
alter table dish_assets enable row level security;
alter table jobs enable row level security;

-- Lectura pública solo de restaurantes publicados
create policy "public read published" on restaurants
  for select using (is_published = true);

-- El dueño manda sobre lo suyo
create policy "owner all" on restaurants
  for all using (owner_id = auth.uid());

create policy "owner dishes" on dishes
  for all using (
    exists (select 1 from restaurants r
            where r.id = dishes.restaurant_id and r.owner_id = auth.uid())
  );
