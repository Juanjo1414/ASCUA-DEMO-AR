-- "Agotado" en vivo, y marca PITS removible por restaurante.

-- ---------------------------------------------------------------------------
-- 1. Agotado
-- ---------------------------------------------------------------------------
-- Distinto de is_available: un plato fuera de carta desaparece; uno agotado
-- sigue a la vista con la etiqueta, para que quien ya conoce la carta no
-- piense que lo quitaron.
--
-- Es una fecha y no un booleano: el panel guarda hasta cuándo está agotado
-- (la medianoche del lugar del dueño) y el plato vuelve solo. Con un
-- booleano, el que se olvida de desmarcar deja el plato agotado para siempre.
alter table public.dishes
  add column if not exists agotado_hasta timestamptz;

comment on column public.dishes.agotado_hasta is
  'Si es futura, el plato se muestra como AGOTADO. Vence sola a medianoche local.';

-- ---------------------------------------------------------------------------
-- 2. Marca PITS
-- ---------------------------------------------------------------------------
-- La carta lleva "Hecho con PITS" al pie; quitarlo es un complemento pagado.
alter table public.restaurants
  add column if not exists sin_marca boolean not null default false;

comment on column public.restaurants.sin_marca is
  'Oculta la marca PITS en la carta. Complemento pagado; lo activa el equipo.';

-- ---------------------------------------------------------------------------
-- 3. Lectura pública para el aviso en vivo
-- ---------------------------------------------------------------------------
-- La carta se renderiza en el servidor con la llave de servicio, así que los
-- platos nunca necesitaron lectura anónima. El aviso en vivo sí: el celular
-- del comensal se suscribe a los cambios, y Realtime aplica RLS con su llave
-- anónima. Se abre sólo lo que la carta ya muestra: platos visibles de
-- restaurantes publicados. Los ocultos siguen sin poder leerse.
drop policy if exists "lectura publica de platos visibles" on public.dishes;

create policy "lectura publica de platos visibles" on public.dishes
  for select using (
    is_available = true
    and exists (
      select 1 from public.restaurants r
      where r.id = dishes.restaurant_id and r.is_published = true
    )
  );

-- Publicar la tabla en Realtime. Añadirla dos veces da error, así que se
-- comprueba antes: la migración se puede correr más de una vez.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'dishes'
  ) then
    alter publication supabase_realtime add table public.dishes;
  end if;
end
$$;
