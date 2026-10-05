# Menú AR multi-restaurante

Menú digital por restaurante: el comensal escanea un QR en la mesa, ve el
menú y toca un plato para verlo en 3D/AR sobre la mesa. El dueño arma su
menú y sube fotos desde el celular; un worker en segundo plano convierte
esas fotos en modelos 3D listos para publicar.

El plan completo (arquitectura, fases, modelo de datos y la parte legal)
está en [`plan-menu-ar-multirestaurante.md`](./plan-menu-ar-multirestaurante.md).
Este README es la referencia rápida de cómo correr y navegar el código;
el plan es la referencia de *por qué* está construido así.

## Estructura del repo

```
apps/
  web/      Next.js 15 — menú público, panel del restaurante, endpoints de API
  worker/   Generación 3D en segundo plano: foto → .glb + .usdz + poster
packages/
  db/       Migraciones SQL, seed de datos demo, tipos de Supabase
```

## Stack

Next.js 15 (App Router) + TypeScript + Tailwind v4 + Supabase (Postgres,
Auth por magic link, Storage) + `<model-viewer>` para AR + Vitest para
tests. El worker corre en Node y usa `gltf-transform`, `usd_from_gltf` y
Puppeteer (para el poster) como dependencias externas — ver
`apps/worker/Dockerfile`.

## Setup

1. **Instalar dependencias** (requiere pnpm — `npm install -g pnpm` si no lo tenés):

   ```bash
   pnpm install
   ```

2. **Crear un proyecto en [supabase.com](https://supabase.com)** y copiar las
   variables de entorno:

   ```bash
   cp apps/web/.env.example apps/web/.env.local
   cp apps/worker/.env.example apps/worker/.env.local
   ```

   Completá `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` y
   `SUPABASE_SERVICE_ROLE_KEY` (Project Settings → API) en ambos. El resto
   de las variables del worker (`GENERATOR`, `TRIPOSR_ENDPOINT`,
   `MESHY_API_KEY`, `WEB_WEBHOOK_URL`) solo hacen falta para correr el
   pipeline de generación 3D — no para el resto de la app.

3. **Aplicar las migraciones**, en orden, con el SQL Editor de Supabase o
   `supabase db push` si usás la CLI:

   ```
   packages/db/migrations/0001_initial_schema.sql       — esquema base + RLS
   packages/db/migrations/0002_admin_panel.sql           — RLS del panel, audit_log, bucket dish-photos
   packages/db/migrations/0003_worker_queue.sql          — claim_next_job(), bucket dish-assets
   packages/db/migrations/0004_self_service_registration.sql — columnas de aceptación de T&C
   ```

4. **Sembrar datos de prueba** — crea un restaurante demo con 2 categorías
   y 6 platos (sin modelos 3D todavía):

   ```bash
   pnpm seed
   ```

5. **Levantar el sitio:**

   ```bash
   pnpm dev
   ```

   `http://localhost:3000/m/la-fonda-demo` — menú público del restaurante
   demo. `http://localhost:3000/registro` — alta de un restaurante nuevo.

## Ver el AR funcionando de punta a punta

El seed solo crea platos con nombre y precio, sin foto — el botón "Ver en
3D / AR" no aparece hasta que un plato tiene un `dish_assets` aprobado.
Para generar el primero:

1. **Arrancá Docker Desktop** (el worker necesita `usd_from_gltf`, que
   solo se instala dentro del contenedor — ver `apps/worker/Dockerfile`).
2. **Conseguí un token de Hugging Face** (gratis): creá cuenta en
   [huggingface.co/join](https://huggingface.co/join) →
   [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens)
   → "New token", permiso "Read" alcanza. Pegalo en `HF_TOKEN` dentro de
   `apps/worker/.env.local`.
3. **Buildeá y corré el worker** desde la raíz del repo:
   ```bash
   docker build -f apps/worker/Dockerfile -t menu-ar-worker .
   docker run --rm --env-file apps/worker/.env.local menu-ar-worker
   ```
   Se queda escuchando la cola de jobs (`Ctrl+C` para pararlo).
4. Con `pnpm dev` corriendo en paralelo, entrá a `/admin/login`, iniciá
   sesión con el correo del restaurante demo (o registrá uno nuevo en
   `/registro`), andá a `/admin/menu`, abrí un plato, subile una foto y
   tocá "Generar 3D". El worker la recoge sola en unos segundos.
5. La generación tarda ~1 minuto (multi-vistas por GPU compartida +
   reconstrucción de la malla). Cuando el job
   termina, volvé al plato en `/admin/menu/[dishId]` y aprobá el modelo
   ("Aprobar y publicar") — recién ahí se activa en el menú público.
6. Abrí `/m/la-fonda-demo` (o el slug que hayas usado) **desde un
   despliegue con HTTPS público**, no desde `localhost`: el celular no
   habilita AR sin HTTPS real. Ver la sección de despliegue más abajo.

Sin Docker el pipeline igual corre y genera el `.glb` (AR funciona en
Android), pero falla en el paso de `.usdz` — necesario solo para Quick
Look en iPhone.

## Comandos

Desde la raíz (usan `pnpm -r` / `--filter` internamente):

| Comando | Qué hace |
|---|---|
| `pnpm dev` | Levanta `apps/web` en `localhost:3000` |
| `pnpm test` | Corre los tests de los tres workspaces (Vitest) |
| `pnpm build` | Build de producción de `apps/web` |
| `pnpm seed` | Siembra el restaurante demo |
| `pnpm --filter worker dev` | Levanta el worker (`tsx watch`, reinicia solo) |

## Rutas

**Público** — sin sesión:
- `/m/[slug]` — menú del restaurante (ISR, 1h). `notFound()` si no existe o no está publicado.
- `/r/[shortId]` — redirect inmutable hacia `/m/[slug]` (esto es lo que apunta el QR impreso).
- `/registro` — alta de restaurante nuevo (nombre, correo, tipo de cocina).
- `/terminos`, `/privacidad`, `/subprocesadores`, `/licencias` — páginas legales. **Todavía vacías (Fase 0, pendiente).**

**Panel** (`/admin/*`) — protegido por `middleware.ts`, requiere sesión (magic link):
- `/admin/login` — pedir el enlace de acceso.
- `/admin/mi-restaurante` — nombre, logo, color, moneda, publicar.
- `/admin/menu` — categorías y platos, con drag & drop (`dnd-kit`).
- `/admin/menu/[dishId]` — detalle del plato: capturar foto, ver estado de la generación 3D, aprobar el modelo.
- `/admin/qr` — vista previa y descarga del QR (PNG, SVG, PDF A6).

**API:**
- `POST /api/registro` — crea la cuenta + el restaurante (usado por `/registro`).
- `GET /api/qr?format=png|svg|pdf` — genera el QR del restaurante del dueño logueado.
- `POST /api/jobs` — encola una foto para generación 3D (usado por `/admin/menu/[dishId]`).
- `POST /api/webhooks/job-done` — el worker la llama al terminar un job, para revalidar el menú público.

## El worker

Loop en segundo plano que reclama jobs de la cola (`claim_next_job()`,
atómico vía `SELECT ... FOR UPDATE SKIP LOCKED`) y por cada uno: descarga
la foto, le saca el EXIF, genera el modelo 3D (InstantMesh, TripoSR o
Meshy, según `GENERATOR`), lo optimiza con `gltf-transform`, lo convierte a `.usdz`,
renderiza un poster y sube todo a Supabase Storage. El modelo queda
`is_active=false` hasta que el dueño lo aprueba desde el panel.

```bash
pnpm --filter worker dev     # local, con tsx
```

Para producción hace falta Docker (Node + Python/USD + Chromium — ver
`apps/worker/Dockerfile`), porque `usd_from_gltf` y Puppeteer no corren
en cualquier entorno Node.

## Desplegar (necesario para probar AR en un celular)

El AR (WebXR, Scene Viewer, Quick Look) pide HTTPS: un celular real no lo
habilita contra `localhost`, aunque esté en la misma wifi. [Vercel](https://vercel.com)
es gratis para esto y es quien mantiene Next.js.

**Ya desplegado:** [https://arfoods-delta.vercel.app](https://arfoods-delta.vercel.app)
(proyecto `arfoods` en la cuenta de Vercel de Luis, Root Directory =
`apps/web`, deployeado con el CLI). `/m/la-fonda-demo` y el redirect
`/r/demo01` ya están verificados en vivo. Para volver a desplegar después
de cambios: `npx vercel --prod --yes` desde la raíz del repo (o conectar
el repo de GitHub desde el dashboard del proyecto para deploys
automáticos en cada push — el auto-connect falló en el link inicial
porque el repo es de otra cuenta de GitHub, `JSLM10/ARFOODS`; conectarlo
a mano desde Project Settings → Git si lo quieren).

Pasos si hay que armar el proyecto de nuevo desde cero:

1. Entrá a [vercel.com](https://vercel.com), "Add New… → Project" e
   importá este repo de GitHub (`JSLM10/ARFOODS`).
2. En la configuración del proyecto, **Root Directory** → `apps/web`
   (el repo es un monorepo pnpm; Vercel detecta `pnpm-lock.yaml` en la
   raíz solo). Framework Preset queda en Next.js automáticamente.
3. Variables de entorno del proyecto (mismas que `apps/web/.env.local`):
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`, `REVALIDATE_SECRET`.
4. Deploy. Vercel te da una URL `https://algo.vercel.app` — esa es la que
   tiene que apuntar el QR.
5. El QR impreso apunta a `/r/[shortId]`, que redirige a `/m/[slug]`
   usando `request.url` como base — no hace falta ninguna variable extra
   para eso, funciona con cualquier dominio.
6. El worker (Docker) sigue corriendo donde vos quieras — local mientras
   generás modelos, o un servidor/VM más adelante — y le pega al
   `WEB_WEBHOOK_URL` de esta URL de Vercel en vez de `localhost`.

## Tests

```bash
pnpm test
```

59 tests entre los tres workspaces: lógica pura (formateo de precios,
slugs, plantillas de menú, reintentos del worker), componentes React
(`DishCard`), rutas de API con Supabase mockeado, y un test "global" que
lee las migraciones SQL y verifica que toda tabla con RLS activado tenga
al menos una política — pensado específicamente para no repetir el bug
real que encontramos en `categories` durante la Fase 4.

## Estado

| Fase | Qué es | Estado |
|---|---|---|
| 0 | Base legal (licencias, T&C, privacidad) | ✅ (borrador de referencia — falta revisión de un abogado antes de operar) |
| 1 | Esqueleto + base de datos | ✅ |
| 2 | Menú público | ✅ |
| 3 | Visor AR | ✅ |
| 4 | Panel del restaurante | ✅ |
| 5 | Pipeline de generación 3D | ✅ generador verificado end-to-end (foto → .glb real, ~1 min) — falta la corrida completa vía Docker con un plato real del panel |
| 6 | Alta de restaurantes en autoservicio | ✅ |
| 7 | Rendimiento, caché, observabilidad | Pendiente |
| 8 | Checklist de demo | Pendiente (es manual, no código) |

`pnpm build` ya corre limpio (las 4 páginas legales de la Fase 0 estaban
vacías y bloqueaban el build; ahora son componentes `.tsx`, no `.mdx` —
el proyecto no tiene el toolchain de MDX instalado).

### Generador 3D gratuito

Default `GENERATOR=instantmesh` en `apps/worker/.env.local`: llama al
Space público y gratis de
[InstantMesh en Hugging Face](https://huggingface.co/spaces/TencentARC/InstantMesh)
(TencentARC, Apache 2.0) con el cliente oficial `@gradio/client`. Corre
sobre GPU compartida (ZeroGPU) — en la práctica esto exige un `HF_TOKEN`
de una cuenta gratuita de Hugging Face (huggingface.co/settings/tokens,
permiso "Read"); sin token, Hugging Face no reserva GPU para la llamada.
Tres pasos encadenados (preprocesar, generar multi-vistas, reconstruir
la malla), ~1 minuto en total, verificado funcionando.

**Por qué no `triposr` (el generador original del plan):** el Space
oficial de TripoSR (`stabilityai/TripoSR`) está roto — tiene un issue
abierto ["not working"](https://huggingface.co/spaces/stabilityai/TripoSR/discussions/30)
desde marzo de 2026 y varios PRs de arreglo (`Fix: Update deprecated
APIs and dependencies`, etc.) sin mergear; nadie de Stability AI está
participando. El código (`generators/triposr.ts`) queda en el repo por
si lo arreglan, pero no es el default. `GENERATOR=triposr` para probarlo
igual.

Para tener también el `.usdz` (AR en iPhone) hace falta correr el worker
con Docker (`apps/worker/Dockerfile`), porque `usd_from_gltf` no es un
paquete de npm — no hay forma de instalarlo en Windows/macOS a pelo. Sin
Docker, el pipeline igual genera el `.glb` y el AR funciona en Android
(WebXR / Scene Viewer); solo Quick Look en iPhone queda pendiente de esa
conversión.

Alcance dejado afuera a propósito: el *gate* que obliga a re-aceptar los
Términos y Condiciones cuando cambia `terms_version` — hoy solo existe la
versión 1, así que se guarda el dato pero no hay UI de re-aceptación
todavía (ver comentario en `apps/web/lib/terms.ts`).

Todo lo de arriba está verificado con `pnpm install` + `pnpm test` +
`tsc --noEmit` en los tres workspaces + `pnpm dev` corriendo de verdad.
Lo único que falta para un `pnpm build` de producción limpio son las
cuatro páginas legales de la Fase 0 (Next.js exige que toda ruta
existente tenga contenido válido para poder compilar).
