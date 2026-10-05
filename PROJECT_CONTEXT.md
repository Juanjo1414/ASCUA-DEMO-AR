# ARFOODS — Contexto técnico del proyecto

> Documento generado a partir de una revisión completa del repositorio (código, migraciones SQL,
> configuración, `README.md` y `plan-menu-ar-multirestaurante.md`). Sirve como mapa rápido de
> arquitectura, stack, seguridad y estado real del proyecto — para profundizar en el *por qué* de
> cada decisión, la fuente de verdad sigue siendo `plan-menu-ar-multirestaurante.md`.

## 1. Qué es el producto

Menú digital multi-restaurante con visualización de platos en 3D/AR. Flujo end-to-end:

```
Dueño sube foto de un plato → worker genera modelo 3D → dueño aprueba →
comensal escanea QR en la mesa → ve el menú → toca un plato → lo ve en AR sobre la mesa
```

Nombre de marca visible en la PWA: **Ascua**. Repo en GitHub: `JSLM10/ARFOODS`.
Desplegado en: `https://arfoods-delta.vercel.app`.

## 2. Arquitectura general

Monorepo con **pnpm workspaces**, tres paquetes:

```
apps/
  web/      Next.js 15 (App Router) — menú público + panel admin + API routes
  worker/   Proceso Node standalone (fuera de Vercel) — pipeline foto → 3D
packages/
  db/       Migraciones SQL (Supabase/Postgres), tipos generados, script de seed
```

Tres planos con necesidades distintas (ver sección 1 de `plan-menu-ar-multirestaurante.md`):

| Plano | Quién | Naturaleza | Notas |
|---|---|---|---|
| Público (`/m/[slug]`, `/r/[shortId]`) | Comensal | Server-rendered, ISR 1h, sin sesión | Cero JS de cliente salvo el botón de AR |
| Panel (`/admin/*`) | Dueño del restaurante | Autenticado, RLS por tenant, PWA instalable | `middleware.ts` protege las rutas |
| Worker | Nadie (background) | Cola async: foto → 3D → optimización → publicación | Corre en Docker, no en Vercel |

**Regla de oro del diseño:** el comensal nunca espera cómputo pesado; todo ocurre antes, en el worker.

## 3. Stack tecnológico

| Capa | Tecnología | Versión aprox. |
|---|---|---|
| Framework web | Next.js (App Router) | 15.1 |
| Lenguaje | TypeScript | 5.6 |
| UI | React | 19 |
| Estilos | Tailwind CSS | v4 |
| Fuentes | `@fontsource/newsreader`, `@fontsource/work-sans` | — |
| Iconos | `lucide-react` | — |
| Drag & drop (panel) | `@dnd-kit/*` | — |
| Visor 3D/AR | `@google/model-viewer` (custom element, carga diferida) | v4 |
| QR | `qrcode` (server-side) | — |
| PDF (QR imprimible) | `pdf-lib` | — |
| Imágenes | `sharp` | — |
| Backend as a Service | **Supabase** (Postgres + Auth + Storage) | cliente `@supabase/supabase-js` + `@supabase/ssr` |
| Tests | Vitest + Testing Library (web), Vitest (worker y db) | — |
| Gestor de paquetes | pnpm (workspaces) | 9.15 |
| Node | ≥ 20 | — |
| Hosting web | Vercel (Root Directory = `apps/web`) | — |
| Worker runtime | Node + Docker (Python/USD + Chromium) | ver `apps/worker/Dockerfile` |

### Pipeline de generación 3D (worker)
- **Generador de modelos**: interfaz `Generator` intercambiable por variable de entorno (`GENERATOR`):
  - `instantmesh` (default) — Space gratuito de Hugging Face (`TencentARC/InstantMesh`, Apache 2.0), vía `@gradio/client`, requiere `HF_TOKEN` para reservar GPU (ZeroGPU).
  - `triposr` — código presente pero **no usado por default**: el Space oficial de Stability AI está roto desde marzo 2026.
  - `meshy` — API de pago (Meshy), el plan gratuito ya no permite descargar los assets.
- **Optimización**: `@gltf-transform/*` (CLI + core + functions + extensions) — simplifica malla, comprime texturas a WebP, compresión meshopt.
- **Escala**: `normalize-scale.ts` — calibra el tamaño real del plato (obligatorio: `ar-scale="fixed"` en el visor, por tema de publicidad engañosa, ver sección 6.4 del plan).
- **USDZ (AR en iPhone)**: `usd_from_gltf`, solo disponible dentro del contenedor Docker (no instalable en Windows/macOS directamente).
- **Poster**: renderizado headless con `puppeteer`.
- **Cola de jobs**: tabla `jobs` en Postgres, reclamo atómico vía función SQL `claim_next_job()` (`SELECT ... FOR UPDATE SKIP LOCKED`), loop de polling cada 10s, reintentos con backoff exponencial (máx. 3 intentos).

No hay LLM ni modelo de lenguaje en este proyecto — la única IA es generación de mallas 3D a partir de una imagen (image-to-3D).

## 4. Base de datos y almacenamiento (Supabase)

Un solo proveedor para Postgres, Auth y Storage. Migraciones versionadas en `packages/db/migrations/`,
aplicadas en orden con el SQL Editor de Supabase o `supabase db push`:

| Migración | Qué agrega |
|---|---|
| `0001_initial_schema.sql` | Esquema base multi-tenant + RLS inicial |
| `0002_admin_panel.sql` | RLS de `categories` (bug real: había quedado sin política), `audit_log`, bucket `dish-photos`, garantía de titularidad de fotos |
| `0003_worker_queue.sql` | `claim_next_job()`, bucket `dish-assets` |
| `0004_self_service_registration.sql` | Columnas de aceptación de T&C (`terms_version`, `terms_accepted_at`, `terms_accepted_ip`) |
| `0005_restaurant_website.sql` | `website_url` en `restaurants` — el QR puede llevar a la web propia del restaurante en vez de a `/m/[slug]` |

### Modelo de datos (tablas principales)

- **`restaurants`** — tenant raíz: `slug` (cambia), `short_id` (fijo, 6 chars, para el QR), `name`,
  `logo_url`, `brand_color`, `currency`, `is_published`, `owner_id` (FK a `auth.users`),
  `website_url` (con constraint que solo permite `http(s)://`), columnas de aceptación de T&C y de
  garantía de derechos de foto.
- **`categories`** — pertenece a un restaurante, con `position` para orden manual.
- **`dishes`** — nombre, descripción, `price_cents`, `photo_url`, `is_available`, `position`.
- **`dish_assets`** — separado de `dishes` porque tiene ciclo de vida propio: `glb_url`, `usdz_url`,
  `poster_url`, `generator`, `is_active` (permite versionar y hacer rollback; solo se activa cuando
  el dueño aprueba).
- **`jobs`** — cola de generación 3D: `status` (`queued|processing|done|failed`), `attempts`, `error`.
- **`audit_log`** — evidencia de acciones sensibles (aprobación de modelo 3D, aceptación de derechos
  de foto) — pensado como respaldo legal, no solo técnico.

### Row Level Security (RLS)

Todas las tablas tienen RLS activo. Patrón general: lectura pública solo de restaurantes
`is_published = true`; todo lo demás exige `owner_id = auth.uid()` (directo o vía `exists(...)` hasta
la tabla `restaurants`). Storage: buckets `dish-photos` y `dish-assets` son de lectura pública (el
menú público no tiene sesión) pero de escritura restringida por carpeta/rol.

**Detalle de seguridad importante:** el menú público (`/m/[slug]`) **no consulta Supabase con la
clave anónima desde el navegador**. Lo lee el servidor (Server Component) con `service role key` en
build/ISR y entrega HTML ya renderizado — menos latencia y cero superficie de ataque en el cliente.
El panel (`/admin`, `/api/jobs`) sí usa el cliente con sesión de cookies + anon key, y confía en RLS
para el aislamiento entre restaurantes.

Dos clientes de Supabase distintos en `apps/web/lib/supabase/`:
- `server-client.ts` — service role, sin sesión, solo para lectura del menú público.
- `server-session-client.ts` — anon key + cookies de sesión, respeta RLS, usado en `/admin` y `/api`.

## 5. Autenticación y control de acceso

- **Supabase Auth con magic link** (sin contraseñas). `apps/web/app/auth/callback/route.ts` canjea
  el código por sesión.
- `middleware.ts` protege todo `/admin/*` excepto `/admin/login`: sin sesión redirige a login; con
  sesión en `/admin/login` redirige al panel. La cookie de sesión se fuerza a 1 año de vida (para que
  la PWA instalada no pida login constantemente) — el refresh token la renueva en cada visita.
- La protección real de datos vive en RLS (Postgres), no en el middleware — el middleware solo evita
  mostrar la UI a quien no tiene sesión.
- Alta de restaurantes (`/registro` → `POST /api/registro`) crea el usuario vía Admin API
  (`service role`) con `email_confirm: true` y dispara el magic link con `emailRedirectTo` apuntando
  al callback.

## 6. Rutas y API

**Público (sin sesión):**
- `GET /m/[slug]` — menú del restaurante, ISR 1h, `notFound()` si no existe o no está publicado.
- `GET /r/[shortId]` — redirect inmutable (307) hacia la URL impresa en el QR: a `website_url` si el
  restaurante la definió (con validación de esquema `http(s)://` para evitar redirects a esquemas
  ejecutables), si no a `/m/[slug]`.
- `GET /registro` — alta de restaurante nuevo.
- `/terminos`, `/privacidad`, `/subprocesadores`, `/licencias` — páginas legales.

**Panel (`/admin/*`, protegido):**
- `/admin/login`, `/admin/mi-restaurante`, `/admin/menu`, `/admin/menu/[dishId]`, `/admin/qr`.
- PWA instalable con `scope`/`start_url` = `/admin` (manifest en `app/manifest.ts`, service worker en
  `public/sw.js`, página offline en `public/offline.html`) — la carta pública queda deliberadamente
  fuera de la app instalada.

**API:**
- `POST /api/registro` — crea cuenta + restaurante + siembra plantilla de menú por tipo de cocina.
- `GET /api/qr?format=png|svg|pdf` — genera el QR del restaurante del dueño logueado (con su logo al centro).
- `POST /api/jobs` — encola una foto para generación 3D. Usa el cliente con sesión (RLS decide si el
  plato es del usuario). **Bloqueada en modo demo** (`NEXT_PUBLIC_DEMO_MODE=true`) — devuelve 503,
  porque sin worker corriendo un job quedaría `queued` para siempre; ocultar el botón en la UI no
  basta como control, así que también se rechaza en el servidor.
- `POST /api/webhooks/job-done` — el worker la llama al terminar un job para revalidar el menú
  público. Protegida con un secreto compartido (`x-revalidate-secret` header vs `REVALIDATE_SECRET`
  env var) — sin ese header correcto responde 401.
- `POST /api/revalidate-menu` — revalidación manual/interna del menú.

## 7. Seguridad — resumen de controles existentes

- **RLS multi-tenant en toda la base de datos**, incluyendo un test dedicado (`packages/db/migrations.test.ts`)
  que lee las migraciones SQL y falla si alguna tabla tiene RLS activado sin ninguna política —
  agregado específicamente tras el bug real de `categories` sin política en la Fase 4.
- **Menú público sin credenciales expuestas al cliente** (lectura server-side con service role, nunca
  desde el navegador).
- **Validación de esquema de URL** en `website_url` (constraint SQL) y en el redirect de `/r/[shortId]`
  (regex `^https?://`) para evitar open redirect hacia esquemas ejecutables (`javascript:`, etc.).
- **Webhook interno protegido por secreto compartido** (`REVALIDATE_SECRET`), no por autenticación de
  usuario — apropiado porque lo llama el worker, no una persona.
- **EXIF stripping** de las fotos subidas (el worker re-codifica con `sharp` sin `withMetadata()`) —
  evita filtrar GPS/ubicación de la cocina del restaurante.
- **Aprobación humana obligatoria** antes de publicar un modelo 3D (`is_active` solo se activa por
  clic explícito del dueño, registrado en `audit_log`) — control legal (Ley 1480, publicidad
  engañosa) más que técnico.
- **Consentimiento de titularidad de fotos** capturado y con timestamp/usuario en `restaurants`.
- **Aceptación de Términos versionada** (`terms_version`, `terms_accepted_at`, `terms_accepted_ip`) —
  el *gate* de re-aceptación cuando suba la versión todavía no está construido (solo hay v1).
- **Diseño "sin datos personales del comensal"**: no hay login, cookies de terceros ni analítica
  identificable en el menú público — decisión de arquitectura tomada explícitamente para simplificar
  el cumplimiento de la Ley 1581 de 2012 (Colombia).
- **Auditoría de licencias de dependencias en CI**: planeada (`license-checker --production` para
  bloquear el build ante licencias GPL/AGPL) pero **`.github/workflows/ci.yml` está vacío hoy** — este
  control, y cualquier otro paso de CI, no está implementado todavía a pesar de estar documentado en
  el plan.
- **Debilidad conocida y documentada**: no hay rate limiting visible en `/api/registro` ni en
  `/api/jobs` más allá de RLS/autenticación; tampoco hay CAPTCHA en el alta de restaurantes.

## 8. Testing

- **Vitest** en los tres workspaces (`web`, `worker`, `db`), ~59 tests en total según el README:
  lógica pura (precios, slugs, plantillas de menú, reintentos del worker), componentes React
  (`DishCard`), rutas de API con Supabase mockeado, y el test estructural de RLS sobre las
  migraciones SQL.
- No hay tests end-to-end (Playwright/Cypress) ni de carga.

## 9. Estado real vs. plan (discrepancias detectadas)

- El plan original (`plan-menu-ar-multirestaurante.md`) especifica páginas legales en **MDX**; el
  README aclara que se implementaron como componentes `.tsx` porque el proyecto no tiene el
  toolchain de MDX instalado — esas rutas existen pero su contenido legal es un borrador de
  referencia, pendiente de revisión por un abogado.
- **CI**: el plan pide un workflow que audite licencias de terceros y falle ante AGPL/GPL;
  `.github/workflows/ci.yml` existe pero está **vacío** — no hay pipeline de CI activo hoy (ni tests
  automáticos en push, ni la auditoría de licencias).
- Funcionalidad añadida **después** del plan original y no descrita en él: `website_url` por
  restaurante (el QR puede llevar a la web propia en vez de al menú), modo demo
  (`NEXT_PUBLIC_DEMO_MODE`), PWA del panel (`manifest.ts`, service worker, shortcuts), sesión
  persistente de 1 año.
- Generador 3D real en uso: `instantmesh` (Hugging Face, gratis), no `triposr` como preveía el plan
  original — cambio documentado en el README por el Space de TripoSR estar roto.
- Fase 7 (rendimiento/observabilidad) y Fase 8 (checklist de demo) siguen **pendientes** según el
  README; el resto de fases (0 a 6) están marcadas como completas, con la salvedad de que la Fase 0
  (legal) es un borrador sin revisión de abogado y la Fase 5 (pipeline 3D) no se ha corrido todavía
  de punta a punta vía Docker con un plato real desde el panel.

## 10. Variables de entorno

**`apps/web/.env.local`:**
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
REVALIDATE_SECRET=
RESTAURANT_SITE_URL=       # opcional, redirect de /r/[shortId] a una web propia
NEXT_PUBLIC_DEMO_MODE=     # 'true' para deshabilitar la generación 3D en /api/jobs
```

**`apps/worker/.env.local`:**
```
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
GENERATOR=instantmesh      # instantmesh | triposr | meshy
INSTANTMESH_SPACE=TencentARC/InstantMesh
TRIPOSR_SPACE=stabilityai/TripoSR
HF_TOKEN=                  # necesario en la práctica para reservar GPU en HF Spaces
MESHY_API_KEY=
WEB_WEBHOOK_URL=
REVALIDATE_SECRET=
```

Ningún `.env*` real está en git (excluidos por `.gitignore`); solo las plantillas `.env.example`.

## 11. Cómo correr el proyecto (resumen)

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local
cp apps/worker/.env.example apps/worker/.env.local
# completar las variables de Supabase, aplicar migraciones 0001→0005 en orden
pnpm seed        # restaurante demo con 2 categorías y 6 platos
pnpm dev         # levanta apps/web en localhost:3000
```

Para el pipeline 3D completo hace falta Docker (worker) + un token de Hugging Face + un despliegue
con HTTPS público (el AR no funciona contra `localhost` en un celular real). Detalle completo en
`README.md`.

## 12. Consideraciones legales integradas al código (contexto de negocio)

El proyecto documenta explícitamente (sección 6 del plan) que los modelos 3D generados por IA caen
en una zona gris de derechos de autor en Colombia (la DNDA no reconoce autoría de IA sin intervención
creativa humana). La estrategia de protección elegida no es derecho de autor sobre el modelo crudo,
sino tres capas combinadas: contrato con el restaurante, control técnico (URLs hasheadas, sin botón
de descarga, buckets propios) y secreto empresarial sobre el pipeline. Esto explica varias decisiones
de código: por qué el `.glb` optimizado y no el crudo es el que se sirve, por qué hay aprobación
humana obligatoria y `audit_log`, y por qué el visor fuerza escala real (`ar-scale="fixed"`) más la
leyenda "modelo referencial" (mitigación de publicidad engañosa bajo la Ley 1480 de 2011).
