-- El QR impreso apunta a /r/{short_id}, que hasta ahora siempre redirigía a
-- la carta /m/{slug}. Pero el comensal que escanea en la mesa espera caer en
-- la web del restaurante —horarios, historia, reservas— con la carta a un
-- toque, no en una lista de platos suelta.
--
-- website_url deja que cada restaurante decida su destino: si está puesta, el
-- QR lleva a su web; si no, sigue cayendo en /m/{slug} como antes. Los
-- códigos ya impresos no cambian: el short_id sigue siendo el mismo.
alter table public.restaurants
  add column if not exists website_url text;

comment on column public.restaurants.website_url is
  'Web propia del restaurante. Si está definida, el QR (/r/{short_id}) redirige aquí en vez de a /m/{slug}.';

-- Sólo http(s): sin esto una URL como javascript:... acabaría en un redirect
-- del servidor hacia un esquema ejecutable.
alter table public.restaurants
  drop constraint if exists restaurants_website_url_scheme;

alter table public.restaurants
  add constraint restaurants_website_url_scheme
  check (website_url is null or website_url ~* '^https?://');
