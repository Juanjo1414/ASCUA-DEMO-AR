-- Fase 5 — lo que necesita el worker para reclamar jobs sin pisarse con
-- otra instancia, y el bucket donde sube glb/usdz/poster ya optimizados.

-- "UPDATE ... WHERE status='queued' ... RETURNING (evita doble toma)"
-- (flujo del worker, paso 1). SELECT ... FOR UPDATE SKIP LOCKED + UPDATE
-- en una sola transacción: si dos workers llaman a esto a la vez, cada
-- uno se lleva un job distinto en vez de pelear por el mismo.
create or replace function claim_next_job()
returns setof jobs
language plpgsql
as $$
declare
  claimed jobs;
begin
  select * into claimed
  from jobs
  where status = 'queued'
  order by created_at
  for update skip locked
  limit 1;

  if claimed.id is null then
    return;
  end if;

  update jobs
  set status = 'processing', updated_at = now(), attempts = attempts + 1
  where id = claimed.id
  returning * into claimed;

  return next claimed;
end;
$$;

-- El worker sube con la service role key, que ya salta RLS/políticas de
-- Storage; solo hace falta que la lectura sea pública para que el menú y
-- el <model-viewer> puedan servir los archivos sin sesión.
insert into storage.buckets (id, name, public)
values ('dish-assets', 'dish-assets', true)
on conflict (id) do nothing;

create policy "public read dish assets" on storage.objects
  for select using (bucket_id = 'dish-assets');
