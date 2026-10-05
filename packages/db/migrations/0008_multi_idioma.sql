-- Multi-idioma de la carta.
--
-- El idioma base lo fija el restaurante —español en Medellín, inglés en
-- Malta— y las traducciones viven en tablas aparte, una fila por idioma.
-- Columnas tipo name_en, name_it no escalan: cada idioma nuevo sería otra
-- migración y otra columna que arrastrar para siempre.
--
-- Cuántos idiomas puede activar cada restaurante lo decide su plan, y eso
-- vive en apps/web/lib/plans.ts. La base sólo guarda cuáles eligió.

-- ---------------------------------------------------------------------------
-- 1. Idioma base y activos
-- ---------------------------------------------------------------------------
alter table public.restaurants
  add column if not exists base_language text not null default 'es';

alter table public.restaurants
  drop constraint if exists restaurants_base_language_valido;

alter table public.restaurants
  add constraint restaurants_base_language_valido
  check (base_language in ('es', 'en', 'it', 'de', 'fr'));

comment on column public.restaurants.base_language is
  'Idioma en que el dueño escribe su carta. Español en Medellín, inglés en Malta.';

-- Idiomas adicionales activos. El límite lo impone el plan, no la base: un
-- restaurante que baja de Business a Growth conserva la fila pero la carta
-- sólo publica los que su plan permite.
alter table public.restaurants
  add column if not exists idiomas text[] not null default '{}';

comment on column public.restaurants.idiomas is
  'Idiomas adicionales al base. El plan decide cuántos se publican.';

-- ---------------------------------------------------------------------------
-- 2. Traducciones
-- ---------------------------------------------------------------------------
create table if not exists public.dish_translations (
  dish_id uuid not null references public.dishes(id) on delete cascade,
  lang text not null,
  name text not null,
  description text,
  -- Marca si un humano tocó esta traducción. La automática se puede
  -- regenerar sin preguntar; la corregida a mano, no — se perdería el
  -- trabajo del dueño en silencio.
  editada_a_mano boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (dish_id, lang)
);

alter table public.dish_translations
  drop constraint if exists dish_translations_lang_valido;

alter table public.dish_translations
  add constraint dish_translations_lang_valido
  check (lang in ('es', 'en', 'it', 'de', 'fr'));

create table if not exists public.category_translations (
  category_id uuid not null references public.categories(id) on delete cascade,
  lang text not null,
  name text not null,
  editada_a_mano boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (category_id, lang)
);

alter table public.category_translations
  drop constraint if exists category_translations_lang_valido;

alter table public.category_translations
  add constraint category_translations_lang_valido
  check (lang in ('es', 'en', 'it', 'de', 'fr'));

-- ---------------------------------------------------------------------------
-- 3. Quién lee y quién escribe
-- ---------------------------------------------------------------------------
alter table public.dish_translations enable row level security;
alter table public.category_translations enable row level security;

drop policy if exists "lectura publica de traducciones de platos" on public.dish_translations;
drop policy if exists "owner escribe traducciones de platos" on public.dish_translations;
drop policy if exists "lectura publica de traducciones de categorias" on public.category_translations;
drop policy if exists "owner escribe traducciones de categorias" on public.category_translations;

-- La carta es pública y se sirve sin sesión: las traducciones de un
-- restaurante publicado tienen que poder leerse igual que sus platos.
create policy "lectura publica de traducciones de platos" on public.dish_translations
  for select using (
    exists (
      select 1 from public.dishes d
      join public.restaurants r on r.id = d.restaurant_id
      where d.id = dish_translations.dish_id and r.is_published = true
    )
  );

create policy "owner escribe traducciones de platos" on public.dish_translations
  for all using (
    exists (
      select 1 from public.dishes d
      join public.restaurants r on r.id = d.restaurant_id
      where d.id = dish_translations.dish_id and r.owner_id = auth.uid()
    )
  );

create policy "lectura publica de traducciones de categorias" on public.category_translations
  for select using (
    exists (
      select 1 from public.categories c
      join public.restaurants r on r.id = c.restaurant_id
      where c.id = category_translations.category_id and r.is_published = true
    )
  );

create policy "owner escribe traducciones de categorias" on public.category_translations
  for all using (
    exists (
      select 1 from public.categories c
      join public.restaurants r on r.id = c.restaurant_id
      where c.id = category_translations.category_id and r.owner_id = auth.uid()
    )
  );
