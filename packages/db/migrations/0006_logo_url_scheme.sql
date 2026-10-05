-- CN-005 (reporte de seguridad 2026-08-28): logo_url se setea desde un
-- <input type="url"> del panel sin ninguna restricción de esquema en DB,
-- a diferencia de website_url (0005_restaurant_website.sql), que sí la
-- tiene. GET /api/qr hace fetch(logo_url) en el servidor para componer el
-- logo dentro del QR — sin este constraint, un dueño auto-registrado
-- podría apuntar logo_url a una dirección interna y usar la respuesta
-- (con/sin logo, tiempo de respuesta) como sonda SSRF.
alter table public.restaurants
  drop constraint if exists restaurants_logo_url_scheme;

alter table public.restaurants
  add constraint restaurants_logo_url_scheme
  check (logo_url is null or logo_url ~* '^https?://');
