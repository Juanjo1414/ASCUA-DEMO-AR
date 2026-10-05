-- Fase 6 — alta de restaurantes en autoservicio (/registro).

-- Aceptación de T&C con versión y sello de tiempo (sección 6.3 del plan):
-- sin esto no hay contrato oponible con nadie. Cuando cambien los
-- términos, se sube TERMS_VERSION en el código y se vuelve a pedir
-- aceptación al siguiente login (esa parte es lógica de aplicación, no
-- de esquema).
alter table restaurants
  add column terms_version integer,
  add column terms_accepted_at timestamptz,
  add column terms_accepted_ip text;
