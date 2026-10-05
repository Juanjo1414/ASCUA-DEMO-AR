-- Idiomas extra contratados por restaurante.
--
-- Los planes incluyen dos idiomas (el base y uno más); Business, todos. Un
-- tercer idioma se cobra aparte y lo activa el equipo a mano cuando el
-- cliente paga. Sin este campo la única forma de darle un idioma más a un
-- restaurante era subirlo de plan, que no es lo que compró.
--
-- Es un número y no una lista: qué idiomas usa lo sigue decidiendo el
-- restaurante en `idiomas`; esto sólo amplía cuántos puede publicar.

alter table public.restaurants
  add column if not exists idiomas_extra integer not null default 0;

alter table public.restaurants
  drop constraint if exists restaurants_idiomas_extra_valido;

alter table public.restaurants
  add constraint restaurants_idiomas_extra_valido
  check (idiomas_extra between 0 and 10);

comment on column public.restaurants.idiomas_extra is
  'Idiomas adicionales pagados aparte, sumados a los que incluye el plan. Lo activa el equipo a mano.';
