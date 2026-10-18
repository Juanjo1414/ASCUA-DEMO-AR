# Plan de implementación — Ascua (PITS)

> **Repos:** `Juanjo1414/ASCUA-DEMO-PAGINA` (demo multi-restaurante) y `Juanjo1414/ASCUA-DEMO-AR` (ARFOODS: estudio 3D + plataforma SaaS).
> **Versión del plan:** 1.1 — 5 de octubre de 2026.
> **Responsable:** Juan José Jaramillo Mora.
> **Rama de trabajo:** `dev/Juanjo` → `main` solo por Pull Request con CI en verde.

---

## 0. Cómo usar este documento

- Cada tarea tiene un **ID** (`P-xxx` para PAGINA, `A-xxx` para AR, `X-xxx` para ambos repos). Cualquier agente (Claude Code o Antigravity) puede tomar una tarea leyendo **solo** su bloque, el `CLAUDE.md` del repo y `docs/ESTADO.md`.
- Cada tarea cabe en **una sesión** (≈1–2 h). Si una tarea crece, se divide antes de empezar.
- Estado de cada tarea: se registra en `docs/ESTADO.md` del repo correspondiente (no aquí), para que este plan sea estable.
- Columna **Herramienta sugerida**:
  - **Claude**: razonamiento de arquitectura, seguridad, revisión y depuración difícil.
  - **Antigravity**: trabajo mecánico y de UI (migrar componentes, estilos, escribir pruebas siguiendo un patrón ya definido).
  - Cualquiera de las dos puede hacer cualquier tarea; es una sugerencia para rendir la cuota semanal de Claude.
- Este plan se copia a ambos repos en `docs/PLAN-IMPLEMENTACION.md`. Si cambia, se actualiza en los dos y se anota en la sección 12.

---

## 1. Resumen ejecutivo y decisiones

**Objetivo de negocio:** validar con restaurantes reales de Medellín si pagarían la suscripción del catálogo Ascua, mostrándoles una demo funcional con su marca y sus platos en 3D/AR, **sin gastar dinero** en infraestructura durante la validación.

| # | Decisión | Por qué | ADR |
|---|---|---|---|
| D1 | **ASCUA-DEMO-PAGINA** se convierte en una **demo estática multi-restaurante**: una plantilla, un paquete de contenido por restaurante. | La demo no necesita base de datos; estática = nada se pausa, nada se cae, costo $0. | `ADR-0001` (PAGINA) |
| D2 | **ASCUA-DEMO-AR (ARFOODS)** tiene dos roles: **(a) Estudio 3D** ya, como CLI local que produce los modelos de la demo; **(b) Plataforma SaaS** después de validar. | Reutiliza el pipeline existente (optimize, normalize-scale, usdz, poster) sin depender de Supabase ni de GPU en vivo. | `ADR-0001` (AR) |
| D3 | Hosting de la demo en **Cloudflare Pages** (plan gratuito). | Permite uso comercial y ancho de banda ilimitado en el plan gratuito; Vercel Hobby es solo para uso no comercial. | ADR-0001 (PAGINA) |
| D4 | **Gitflow simplificado:** todo se trabaja en `dev/Juanjo`; `main` es producción; se despliega **solo desde GitHub Actions** cuando todo el CI pasa. | Producción la ven usuarios reales; nada llega a `main` sin pruebas. | — |
| D5 | La landing migra de JavaScript a **TypeScript** (incremental). | Los puertos/interfaces de la arquitectura por capas necesitan tipos; ARFOODS ya es TypeScript. | — |
| D6 | Los datos de cada restaurante son **contenido versionado** (`content/restaurants/<slug>/`), validado con esquema en cada build. | Aislamiento verificable entre restaurantes y control de calidad de modelos (`aprobado: true`). | ADR-0001 (PAGINA) |
| D7 | Node **22 LTS** en todos los entornos. | Node 20 llegó a fin de soporte en abril de 2026; Vite 8 y el Dockerfile del worker ya usan 22. | — |
| D8 | La plataforma ARFOODS (fase 8) se re-arquitecta **solo después** de tener al menos 1 restaurante dispuesto a pagar. | Evita invertir semanas en algo no validado. La decisión de hosting de producción (Vercel Pro vs. Cloudflare) se toma en ese momento. | ADR futuro |

---

## 2. Línea base verificada (5 oct 2026)

Ejecutado sobre un clon limpio de ambos repos.

| Repo | Comando | Resultado | Acción |
|---|---|---|---|
| PAGINA | `npm ci` | ✅ OK | — |
| PAGINA | `npm run lint` (oxlint) | ✅ 0 errores, 1 warning (`LanguageContext.jsx`) | Corregir en P-101 |
| PAGINA | `npm run build` | ✅ OK, ⚠️ chunk > 500 kB | Presupuesto de rendimiento en P-702 |
| PAGINA | pruebas | ❌ **No existen** (0 tests) | Fase P-1 |
| PAGINA | dependencia externa | ⚠️ `arAssets.js`, `.env.example` y la CSP de `vercel.json` apuntan al Supabase **de un tercero** (`vnztoczhwrqjrgatiutz`) | Eliminar en X-009 |
| AR | `pnpm install --frozen-lockfile` | ⚠️ Falla el `postinstall` de Puppeteer si no puede descargar Chromium | `PUPPETEER_SKIP_DOWNLOAD=1` en CI (A-002) |
| AR | `pnpm -r test` | ✅ **103 tests**: db 2, worker 16, web 85 | Mantener y ampliar |
| AR | `tsc --noEmit` (web y worker) | ✅ OK | Agregar `typecheck` al CI |
| AR | `pnpm --filter web lint` | ❌ **Roto**: ESLint 9 sin `eslint.config.*` → el CI actual queda en rojo | A-001 |
| AR | seguridad | ✅ Ya corregidos CN-001/002/003/005/007/009/010/014/016/018 (dockerignore, ssrf-guard, USER no-root, base pinneada por digest, multi-stage, headers, `timingSafeEqual`, CI) | Re-auditar en A-004 |
| AR | documentación | ⚠️ `PROJECT_CONTEXT.md` desactualizado (dice CI vacío y 5 migraciones; hay CI y 10 migraciones) | A-003 |

---

## 3. Arquitectura objetivo — ASCUA-DEMO-PAGINA

### 3.1 Capas (Clean Architecture ligera)

```
┌───────────────────────────────────────────────────────────────┐
│ presentation/   React: páginas, componentes, hooks, tema      │  ← depende de application (vía composition root)
├───────────────────────────────────────────────────────────────┤
│ application/    Casos de uso + puertos (interfaces TS)        │  ← depende solo de domain
├───────────────────────────────────────────────────────────────┤
│ domain/         Entidades, value objects, esquemas, reglas    │  ← no depende de nada (ni React, ni browser)
├───────────────────────────────────────────────────────────────┤
│ infrastructure/ Adaptadores: JSON estático, Quick Look,       │  ← implementa puertos de application
│                 Scene Viewer, model-viewer, localStorage,     │
│                 analítica, detección de navegador             │
└───────────────────────────────────────────────────────────────┘
  app/compositionRoot.ts  →  único lugar que instancia adaptadores y los inyecta
```

**Regla de dependencias** (verificada en CI con `dependency-cruiser`, tarea P-108):
- `domain` no importa nada de las otras capas, ni `react`, ni `window`/`document`.
- `application` importa solo `domain`.
- `infrastructure` importa `application` (puertos) y `domain`.
- `presentation` importa `application` y `domain`; **nunca** `infrastructure` directamente (recibe todo por el composition root / contexto).

### 3.2 Estructura de carpetas objetivo

```
ASCUA-DEMO-PAGINA/
├── CLAUDE.md · AGENTS.md
├── docs/
│   ├── PLAN-IMPLEMENTACION.md   (este documento)
│   ├── ESTADO.md                (estado vivo: tarea actual, siguiente, bloqueos)
│   ├── DESIGN.md                (dirección visual — la carga Juan)
│   ├── adr/                     (decisiones de arquitectura)
│   ├── sesiones/                (bitácora por sesión, alimenta graphify)
│   ├── seguridad/               (reportes cyber-neo)
│   └── runbooks/                (nuevo-restaurante.md, rollback.md, qa-dispositivos.md)
├── content/
│   └── restaurants/
│       ├── _plantilla/          (restaurante de ejemplo; nunca se publica)
│       ├── ascua-demo/          (demo genérica)
│       └── <slug>/              (un restaurante = una carpeta)
│           ├── restaurant.json
│           └── assets/{logo.svg, platos/<id>/{modelo.glb, modelo.usdz, poster.webp, foto.webp}}
├── scripts/
│   ├── validate-content.ts      (esquema + aislamiento + pesos + aprobado + expiración)
│   ├── build-content.ts         (copia content/ → dist/data/ y genera HTML por restaurante con meta/OG)
│   └── generate-qr.ts
├── src/
│   ├── domain/
│   │   ├── restaurant/          (Restaurant, Theme, ContactInfo, esquema zod)
│   │   ├── menu/                (Dish, Category, Price, reglas de disponibilidad)
│   │   └── ar/                  (ArAsset, DeviceCapabilities, ArLaunchMode)
│   ├── application/
│   │   ├── ports/               (RestaurantRepository, ArLauncher, SoldOutStore, AnalyticsTracker, EnvironmentDetector)
│   │   └── use-cases/           (getRestaurant, buildMenuView, launchDishAr, buildReservationLink, toggleSoldOut)
│   ├── infrastructure/
│   │   ├── content/             (StaticJsonRestaurantRepository)
│   │   ├── ar/                  (QuickLookLauncher, SceneViewerLauncher, ModelViewerFallbackLauncher)
│   │   ├── browser/             (BrowserEnvironmentDetector — de browserEnv.js)
│   │   ├── storage/             (LocalStorageSoldOutStore)
│   │   └── analytics/           (NoopAnalytics / CloudflareAnalytics)
│   ├── presentation/
│   │   ├── pages/               (RestaurantPage, QrPage, NotFoundPage, ExpiredPage, HomePage)
│   │   ├── components/          (menu/, ar/, reservation/, feedback/, layout/)
│   │   ├── hooks/
│   │   ├── theme/               (tokens desde DESIGN.md + override por restaurante)
│   │   └── i18n/
│   ├── app/
│   │   ├── compositionRoot.ts
│   │   ├── router.tsx
│   │   └── main.tsx
│   └── shared/                  (utilidades puras sin dominio: assertNever, Result<T,E>)
├── tests/
│   ├── e2e/                     (Playwright: flujos, aislamiento, AR, accesibilidad)
│   └── fixtures/
└── public/  (_headers, _redirects, robots.txt, favicon)
```

### 3.3 Principios SOLID aplicados (concreto, no teórico)

| Principio | Aplicación en PAGINA |
|---|---|
| **S** — Responsabilidad única | Hoy `launchAr.js` decide la plataforma **y** lanza; se divide en `EnvironmentDetector` (qué dispositivo/navegador), `ArLaunchPolicy` (qué modo usar, función pura de dominio) y un `ArLauncher` por plataforma. `Menu.jsx` (256 líneas) se separa en contenedor + componentes de presentación. |
| **O** — Abierto/cerrado | Los lanzadores AR se registran en un mapa `ArLaunchMode → ArLauncher`. Agregar WebXR en el futuro = un adaptador nuevo, sin tocar los existentes. |
| **L** — Sustitución de Liskov | Todo `ArLauncher` cumple el mismo contrato (`launch(asset): LaunchResult`) y las mismas pruebas de contrato (`describe.each` sobre los tres adaptadores). |
| **I** — Segregación de interfaces | Puertos pequeños: `RestaurantRepository` solo lee; `SoldOutStore` solo `isSoldOut/toggle`. Nadie implementa métodos que no usa. |
| **D** — Inversión de dependencias | Los casos de uso reciben puertos por parámetro. El `compositionRoot` decide las implementaciones. En pruebas se inyectan dobles en memoria, sin `window` ni red. |

### 3.4 Modelo multi-restaurante (aislamiento)

**Rutas públicas**

| Ruta | Contenido |
|---|---|
| `/` | Página genérica de Ascua/PITS con la demo `ascua-demo`. **Nunca** lista restaurantes. |
| `/r/<slug>/` | Landing + carta del restaurante (HTML pre-generado con `<title>`, descripción y OpenGraph propios → buena vista previa al compartir por WhatsApp). |
| `/r/<slug>/qr` | QR imprimible que apunta a `/r/<slug>/`. |
| `/data/<slug>/…` | `restaurant.json` y assets de ese restaurante. |

**Esquema `restaurant.json` (resumen; el esquema zod en `domain/restaurant` es la fuente de verdad)**

```jsonc
{
  "schemaVersion": 1,
  "slug": "la-brasa-7k2p",              // ^[a-z0-9]+(-[a-z0-9]+)*-[a-z0-9]{4}$ — sufijo aleatorio obligatorio
  "estado": "activo",                    // activo | pausado
  "expira": "2026-12-15",                // pasada la fecha: página "demo finalizada"
  "autorizacion": { "fecha": "2026-10-10", "medio": "whatsapp", "contacto": "Nombre del dueño" },
  "nombre": "La Brasa",
  "idiomas": ["es", "en"],
  "tema": { "primario": "#C2410C", "parTipografico": "editorial", "logo": "assets/logo.svg" },
  "contacto": { "whatsapp": "573001234567", "direccion": "…", "horario": [ … ], "mapsUrl": "https://…" },
  "categorias": [
    { "id": "fuertes", "nombre": { "es": "Platos fuertes", "en": "Mains" },
      "platos": [
        { "id": "hamburguesa-casa", "nombre": { "es": "…", "en": "…" }, "descripcion": { … },
          "precio": 28000, "foto": "assets/platos/hamburguesa-casa/foto.webp",
          "modelo": { "glb": "assets/platos/hamburguesa-casa/modelo.glb",
                      "usdz": "assets/platos/hamburguesa-casa/modelo.usdz",
                      "poster": "assets/platos/hamburguesa-casa/poster.webp",
                      "escalaRealCm": 18 /* lado más largo del plato servido, en cm */, "aprobado": true, "aprobadoPor": "Juan", "fechaAprobacion": "2026-10-12" } } ] } ]
}
```

**Controles de aislamiento (todos automatizados)**

1. **Validación de rutas:** `validate-content.ts` rechaza cualquier ruta de asset que salga de su carpeta (`..`, rutas absolutas, URLs externas, enlaces simbólicos). El build falla.
2. **Slug no adivinable** con sufijo aleatorio de 4 caracteres + `noindex` + `robots.txt` + `/` sin listado.
3. **Repositorio con guardia:** `StaticJsonRestaurantRepository.get(slug)` valida el slug contra la expresión regular antes de hacer `fetch` y valida la respuesta con zod (nada sin validar llega a la UI).
4. **Prueba E2E de aislamiento:** al cargar `/r/A/`, Playwright registra todas las peticiones de red y falla si alguna va a `/data/B/`.
5. **Detección de reutilización:** el validador advierte si dos restaurantes comparten el mismo hash de archivo (posible copia de un plato a otro cliente).
6. **Ciclo de vida:** `expira` + `estado`. Un script `content:expired` lista restaurantes vencidos para borrarlos (también se borran sus fotos: datos del cliente).
7. **Límite honesto:** esto es separación por diseño + discreción, no control de acceso. Es suficiente porque el contenido es una carta pública. El aislamiento fuerte con RLS vive en ARFOODS (fase 8).

### 3.5 Experiencia móvil, intuitiva y auto-explicativa

**Principio:** una persona que nunca ha usado AR debe poder ver un plato sobre su mesa **sin que nadie le explique nada**. El producto se entiende solo.

| Regla | Detalle |
|---|---|
| Mobile-first | Se diseña primero para 360 × 640 px y se amplía hacia arriba. Se prueba en 360, 390, 430, 768 y 1280 px. Sin scroll horizontal nunca. |
| Áreas táctiles | Todo botón o enlace ≥ 48 × 48 px, con separación suficiente para el pulgar. Nada depende de *hover*. |
| Texto legible | Cuerpo ≥ 16 px, contraste AA mínimo, máximo ~70 caracteres por línea. |
| Lenguaje sin tecnicismos | "**Ver en mi mesa**" (no "AR" ni "realidad aumentada" como botón), "Girar el plato", "Volver a la carta". Íconos siempre acompañados de texto. |
| Una acción principal por pantalla | En la ficha del plato, el botón "Ver en mi mesa" es el elemento más visible. |
| Pocos toques | Carta → plato → "Ver en mi mesa" → cámara. La guía (3.6) aparece la **primera vez**; después, 2 toques. |
| Ayuda siempre a mano | Botón fijo "¿Cómo funciona?" con 3 pasos ilustrados. Pista la primera vez: "Toca un plato para verlo en tu mesa". |
| Estados claros | Cargando (esqueleto + texto "Preparando tu plato…"), error en palabras simples **con una acción** ("Revisa tu conexión y toca Reintentar"), sin conexión, plato agotado. |
| Zonas seguras | Respeta notch y barra inferior (`env(safe-area-inset-*)`). Botones principales al alcance del pulgar. |
| Movimiento | Animaciones cortas y útiles; respeta `prefers-reduced-motion`. Fluido en Android de gama media. |
| Validación real | Prueba de usabilidad con 5 personas no técnicas antes de la v1.0.0 (tarea P-406). |

### 3.6 Experiencia AR: que el plato aparezca bien, en su tamaño real

**Problema:** si el modelo abre muy grande no se aprecia; si abre muy pequeño no se ve. Además, quien no conoce AR no sabe que debe mover el teléfono para que la cámara "encuentre" la mesa.

**Cómo se resuelve (cuatro capas):**

1. **Modelo bien preparado (Estudio 3D, A-204):** cada plato se normaliza a **su medida real** (`escalaRealCm` en `restaurant.json`: lado más largo del plato servido), con el **origen en el centro de la base** (se apoya sobre la mesa, no flota ni se hunde) y orientado de frente. Hoy el pipeline fija **todos** los platos a 16 cm; eso se reemplaza por la medida de cada plato.
2. **Escala fija (ya existe, se conserva):** `#allowsContentScaling=0` en Quick Look (iPhone) y `resizable=false` en Scene Viewer (Android). El comensal ve la porción tal como se la van a servir. Es también una protección frente a publicidad engañosa (Ley 1480 de 2011): no se permite agrandar el plato.
3. **Guía previa en nuestra página (P-306):** antes de abrir la cámara, una pantalla corta e ilustrada:
   1. "Apunta la cámara a tu mesa".
   2. "Mueve el teléfono despacio de lado a lado hasta que aparezca el plato".
   3. "Acércate o camina alrededor para verlo desde todos los ángulos".
   Más dos notas: "El plato aparece en su tamaño real" y "Funciona mejor con buena luz". El botón "Entendido, abrir cámara" es el toque que lanza el AR (iOS exige un toque del usuario para abrir Quick Look). Se muestra la primera vez por dispositivo; luego queda accesible desde "¿Cómo funciona?".
4. **Escaneo del espacio (nativo):** Quick Look y Scene Viewer muestran su propia animación pidiendo mover el teléfono hasta detectar una superficie, y colocan el plato sobre ella. La guía previa hace que esa animación ya resulte familiar.

**Si el teléfono no admite AR**, o está en un navegador embebido (Instagram, WhatsApp): mensaje claro y amable ("Tu teléfono no permite ver el plato sobre tu mesa, pero puedes girarlo aquí") y visor 3D interactivo en la página, con el mismo encuadre cuidado (cámara a ~45°, plato completo visible, rotación automática lenta).

**Precarga:** al abrir la ficha de un plato se precarga su `poster` y se pide el modelo en segundo plano, para que la cámara muestre el plato lo antes posible.

---

## 4. Arquitectura objetivo — ASCUA-DEMO-AR (ARFOODS)

### 4.1 Rol inmediato: Estudio 3D (CLI local)

```
modelo crudo (.glb de TRELLIS/Hunyuan/escaneo)  o  foto (vía Generator)
        │
        ▼
apps/worker/src/cli/build-asset.ts   ← NUEVO: entrada por línea de comandos, sin Supabase
        │  reutiliza: pipeline/normalize-scale.ts → optimize.ts → usdz.ts (Docker) → poster.ts
        ▼
salida/<plato>/{modelo.glb, modelo.usdz, poster.webp, manifest.json}
        │  manifest: pesos, hash SHA-256, dimensiones, escala, generador, licencia del generador
        ▼
se copia a ASCUA-DEMO-PAGINA/content/restaurants/<slug>/assets/platos/<id>/
```

El `Generator` actual ya es una interfaz intercambiable (buena inversión de dependencias); se le agrega un adaptador `LocalFileGenerator` (recibe un `.glb` ya generado) y, opcionalmente, `TrellisGenerator`.

### 4.2 Rol futuro: plataforma SaaS (fase 8, después de validar)

Arquitectura **modular por funcionalidad + capas** dentro de `apps/web`:

```
apps/web/src/
├── modules/
│   ├── restaurants/   { domain, application, infrastructure (SupabaseRestaurantRepository), ui }
│   ├── menu/          { … }
│   ├── dishes/        { … }
│   ├── assets3d/      { … }
│   ├── jobs/          { … }
│   ├── qr/            { … }
│   ├── analytics/     { … }
│   ├── i18n/          { … }
│   └── auth/          { … }
├── shared/            (errors, Result, ssrf-guard, format-price)
└── app/               (rutas Next.js delgadas: validan entrada con zod → llaman caso de uso → responden)
```

- Los route handlers (`app/api/**/route.ts`) se vuelven **controladores delgados**: validar → caso de uso → mapear errores (el catálogo de `errors.ts` se conserva).
- Supabase solo se usa desde `infrastructure/`. La UI y los casos de uso dependen de interfaces de repositorio.
- **Dos proyectos Supabase gratuitos**: `ascua-dev` y `ascua-prod` (el plan gratuito permite dos proyectos activos). Migraciones con Supabase CLI.
- Pruebas de aislamiento entre inquilinos con dos usuarios reales en el proyecto `dev` (lectura cruzada debe fallar por RLS).
- `lib/` (29 archivos planos) se reparte en módulos **un módulo por PR**, con las pruebas existentes como red de seguridad.

---

## 5. Estrategia de pruebas

Basada en la pirámide (skill `engineering:testing-strategy`): muchas pruebas unitarias rápidas, algunas de integración, pocas E2E.

### 5.1 PAGINA

| Nivel | Herramienta | Qué cubre | Meta |
|---|---|---|---|
| Unitarias | Vitest | `domain/` y `application/` (reglas, casos de uso con dobles) | **≥ 90 %** líneas y ramas en esas capas (umbral en `vitest.config`) |
| Contrato | Vitest `describe.each` | Los 3 `ArLauncher` y los repositorios cumplen el mismo contrato | 100 % de adaptadores |
| Componentes | Vitest + Testing Library + jsdom | Tarjeta de plato, botón AR, aviso de navegador embebido, selector de idioma | Flujos críticos cubiertos |
| Contenido | `validate-content.ts` (+ pruebas del propio validador) | Esquema, aislamiento, pesos, `aprobado`, expiración | Corre en cada build |
| Arquitectura | dependency-cruiser | Regla de dependencias entre capas | 0 violaciones |
| E2E | Playwright (proyectos: Desktop Chrome, Pixel 7, iPhone 14) | Carga por slug, 404, expirado, abrir AR (atributos `rel="ar"` y `intent://` correctos), reservas por WhatsApp, **aislamiento de red** | Flujos críticos verdes |
| Accesibilidad | `@axe-core/playwright` | Sin violaciones serias/críticas | 0 serias/críticas |
| Rendimiento | Lighthouse CI (móvil) | Performance ≥ 85, Accesibilidad ≥ 95, Buenas prácticas ≥ 95 | Umbrales en `lighthouserc` |
| Responsive | Playwright (360, 390, 430, 768, 1280 px) | Sin scroll horizontal, áreas táctiles ≥ 48 px, botón "Ver en mi mesa" visible sin desplazarse en la ficha del plato | 0 fallos |
| Guía AR | Playwright | La guía aparece la primera vez y no la segunda; "¿Cómo funciona?" siempre la abre; sin AR → visor 3D con mensaje | Verde |
| Usabilidad | Sesión con 5 personas no técnicas (P-406) | "Encuentra este plato y míralo sobre tu mesa" sin ayuda | ≥ 4 de 5 lo logran solos |
| Manual | `docs/runbooks/qa-dispositivos.md` | AR real en el iPhone y el Android de Juan, con datos móviles, dentro y fuera de Instagram/WhatsApp | Checklist firmado antes de cada merge a `main` que toque AR o contenido |

### 5.2 AR (ARFOODS)

| Nivel | Herramienta | Qué cubre | Meta |
|---|---|---|---|
| Unitarias/integración (existentes) | Vitest | 103 pruebas actuales | Ninguna se elimina sin reemplazo |
| CLI Estudio 3D | Vitest + modelo de prueba pequeño | `build-asset` produce los 4 archivos, respeta pesos y escala | Pruebas de integración con fixture |
| Tipos | `tsc --noEmit` | web, worker, db | 0 errores |
| Lint | ESLint 9 (flat config) | web | 0 errores |
| Imagen Docker | `docker build` del worker | Que el Dockerfile construya | En CI solo si cambia `apps/worker/**` |
| Fase 8 | Playwright + Supabase dev | Menú público, panel, aislamiento RLS con dos usuarios | Antes de la primera venta |

**Reglas transversales:** todo bug corregido trae su prueba de regresión; prohibido desactivar o saltar pruebas (`.skip`, `.only`) en commits; nada de snapshots gigantes.

---

## 6. Flujo Git y CI/CD

### 6.1 Flujo

```
 (local, rama dev/Juanjo)
   código ──► pre-commit: lint-staged (formato + lint de archivos tocados)
         ──► pre-push:   npm run verify  (lint + tipos + unitarias + contenido + arquitectura + build)
                         ✗ si falla, NO se sube
   git push origin dev/Juanjo
        │
        ▼
 GitHub Actions (deploy.yml en PAGINA / ci.yml en AR)
   CI completo + E2E + seguridad (gitleaks, npm audit)
        │ ✓
        ▼
 PAGINA: despliegue PREVIEW en Cloudflare Pages (URL de vista previa de la rama)
        │  → Juan prueba en su iPhone y su Android (runbook qa-dispositivos)
        ▼
 Pull Request dev/Juanjo → main   (plantilla con checklist + /deploy-checklist)
   CI corre de nuevo sobre el PR; protección de rama exige checks en verde
        │ ✓ merge (squash)
        ▼
 push a main → CI → despliegue PRODUCCIÓN (el mismo artefacto probado) → smoke test E2E contra producción
        │ ✗ smoke falla → rollback (runbook rollback.md: "Rollback" al despliegue anterior en Cloudflare)
```

### 6.2 Reglas

- **Nunca** se hace commit ni push directo a `main`. **Nunca** `--no-verify`. **Nunca** `push --force` a `main`.
- Commits con **Conventional Commits** (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`, `ci:`), descripción en español, en imperativo, pequeños.
- Un PR = una tarea del plan (o pocas relacionadas). El título lleva el ID: `feat(P-203): validador de contenido`.
- Merge **squash** a `main`; después se sincroniza `dev/Juanjo` con `main`.
- Versionado: tags `vMAJOR.MINOR.PATCH` en `main` + `CHANGELOG.md`.
- Producción solo se despliega desde GitHub Actions (Cloudflare Pages en modo *Direct Upload*, **sin** la integración Git automática) para que **nada** se publique sin pasar el CI.

### 6.3 Protección de rama `main` (GitHub → Settings → Branches/Rulesets)

- Requerir Pull Request antes de hacer merge (0 aprobaciones requeridas, porque eres el único desarrollador y GitHub no deja aprobar tu propio PR).
- Requerir que pasen los checks: `verify`, `e2e`, `security` (PAGINA) / `build-test`, `security` (AR).
- Requerir rama actualizada antes del merge. Bloquear force push y borrado.
- Nota: en cuentas gratuitas, las reglas de protección aplican a repos públicos; si los repos vuelven a ser privados, verifica el plan de GitHub.

### 6.4 Secretos y variables (GitHub → Settings → Secrets and variables → Actions)

| Nombre | Tipo | Repo | Uso |
|---|---|---|---|
| `CLOUDFLARE_API_TOKEN` | Secret | PAGINA | Token con permiso *Cloudflare Pages: Edit* únicamente |
| `CLOUDFLARE_ACCOUNT_ID` | Secret | PAGINA | ID de cuenta |
| `CF_PAGES_PROJECT` | Variable | PAGINA | Nombre del proyecto en Cloudflare Pages |
| `PROD_URL` | Variable | PAGINA | URL de producción para el smoke test |
| (fase 8) `SUPABASE_*` | Secret | AR | Solo cuando exista la plataforma; nunca en el repo |

Environments de GitHub: `preview` y `production` (este último puede exigir confirmación manual si lo deseas).

---

## 7. Seguridad

| Control | Dónde | Cuándo |
|---|---|---|
| Escaneo de secretos (gitleaks) | CI | Cada push y PR |
| `npm audit --omit=dev --audit-level=high` / `pnpm audit --prod` | CI | Cada push y PR (bloquea en `high`/`critical` de producción) |
| Dependabot (npm + GitHub Actions) | GitHub | Semanal |
| CodeQL (gratuito en repos públicos) | GitHub | Semanal + PR a `main` |
| Auditoría completa **cyber-neo** (solo lectura) | Claude Code | Antes de cada release a `main` con cambios de código y cada 2 semanas. Reporte en `docs/seguridad/AAAA-MM-DD.md` |
| `/security-review` (comando incorporado de Claude Code) | Claude Code | Sobre el diff antes de abrir cada PR |
| Cabeceras: CSP sin dominios de terceros, HSTS, `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` | `public/_headers` | P-701 |
| Validación de toda entrada externa (JSON de contenido, parámetros de URL) con zod | Código | Siempre |
| Sin datos personales del comensal (sin cookies, sin login, analítica sin cookies) | Diseño | Siempre (Ley 1581 de 2012) |
| Autorización escrita del restaurante para usar su carta y fotos + borrado al expirar | `restaurant.json` + runbook | Cada restaurante |
| Disclaimer Ley 1480 de 2011 visible en el visor 3D | UI | Siempre |
| Licencias de dependencias y de generadores 3D (prohibido GPL/AGPL; licencias de modelos verificadas y archivadas) | CI (`license-checker`) + `docs/licencias/` | P-704 / A-201 |

---

## 8. Herramientas para agentes

### 8.1 graphify (grafo de conocimiento del proyecto y de las decisiones)

graphify es una skill que convierte una carpeta (código, docs, PDFs, imágenes) en un grafo de conocimiento consultable; el código se analiza localmente y los documentos se procesan con Claude.

**Instalación (una vez, en Windows / PowerShell; requiere Python 3.10+ y `uv`):**

```powershell
uv tool install graphifyy          # el paquete se llama así, con doble "y"
cd <repo>
graphify install --project         # registra la skill dentro del repo (.claude/skills/...); commitéala
graphify hook install              # reconstruye el grafo en cada commit
```

**Qué se indexa:** el código + `docs/` completo. Como cada decisión de arquitectura (`docs/adr/`), cada bitácora de sesión (`docs/sesiones/`) y este plan viven en `docs/`, **las conversaciones y decisiones quedan como nodos del grafo**, conectadas al código que afectan.

**Uso obligatorio (ver CLAUDE.md):**
1. Al iniciar sesión: consultar el grafo antes de leer archivos a ciegas (`graphify query "…"`, `graphify path "A" "B"`, `graphify explain "X"`).
2. Al cerrar sesión: escribir la bitácora en `docs/sesiones/AAAA-MM-DD-<tema>.md` y actualizar (`/graphify . --update`).
3. En Antigravity: la CLI `graphify query` funciona igual desde la terminal integrada.

Verifica tras la primera ejecución en qué carpeta guarda el grafo y decide si versionas el reporte y el JSON (recomendado, para que Antigravity lo use sin reconstruir) e ignoras la caché.

### 8.2 Skills y comandos (cuándo usar cada uno)

| Momento | Skill / comando |
|---|---|
| Planear una tarea de más de un archivo | Modo plan de Claude Code; `product-management:write-spec` para funcionalidades nuevas |
| Tomar una decisión técnica | `engineering:architecture` → ADR en `docs/adr/` |
| Diseñar pruebas de una funcionalidad | `engineering:testing-strategy` |
| Depurar | `engineering:debug` |
| Revisar el diff antes del PR | `engineering:code-review` + `/security-review` |
| Auditoría de seguridad completa | `cyber-neo` (solo lectura) |
| Antes de merge a `main` | `engineering:deploy-checklist` |
| Documentación / runbooks | `engineering:documentation` |
| Deuda técnica (cada fin de fase) | `engineering:tech-debt` |
| UI: accesibilidad y crítica visual | `design:accessibility-review`, `design:design-critique` |
| Evitar sobreingeniería | `ponytail` (modo `lite`) cuando una solución crezca más de lo necesario |
| Mapa del proyecto / memoria entre sesiones | `graphify` |

Si alguna skill no está instalada en tu Claude Code, el agente debe decirlo y seguir el procedimiento manual equivalente descrito en `CLAUDE.md`, nunca omitir el paso.

### 8.3 Traspaso Claude Code ↔ Antigravity

- **Fuente única de reglas:** `CLAUDE.md`. `AGENTS.md` (que lee Antigravity) remite a `CLAUDE.md` y agrega solo diferencias.
- **Estado vivo:** `docs/ESTADO.md` — tarea actual, último paso completado, siguiente paso exacto, bloqueos, comandos para verificar. Se actualiza **siempre** al cerrar sesión, sin importar la herramienta.
- **Regla de oro:** ninguna sesión termina con trabajo sin commitear en un estado que no pase `npm run verify`. Si no se terminó, se deja en un commit `wip:` en `dev/Juanjo` **que sí pase** verify, o se documenta en ESTADO.md exactamente qué falta.

---

## 9. Backlog por fases

Formato: **ID — Título** · Repo · Herramienta sugerida · Depende de
Descripción. **Criterios de aceptación (CA).** Skill.

### Fase 0 — Fundaciones (ambos repos)

**X-001 — Crear rama de trabajo** · ambos · cualquiera · —
`git checkout -b dev/Juanjo` desde `main` y `git push -u origin dev/Juanjo`.
CA: la rama existe en GitHub en ambos repos.

**X-002 — Instalar los archivos de gobierno** · ambos · cualquiera · X-001
Copiar `CLAUDE.md`, `AGENTS.md`, `docs/ESTADO.md`, `docs/adr/0001-*`, `.github/` (workflows y plantilla de PR) y `docs/PLAN-IMPLEMENTACION.md` desde los entregables.
CA: archivos en `dev/Juanjo`; `CLAUDE.md` legible por Claude Code (`/memory` lo muestra) y `AGENTS.md` por Antigravity.

**X-003 — Instalar graphify y construir el primer grafo** · ambos · Claude · X-002
Ver sección 8.1. CA: el grafo existe; `graphify query "launchAr"` (PAGINA) y `graphify query "claim_next_job"` (AR) devuelven resultados; hook post-commit instalado.

**X-004 — Hooks locales (husky + lint-staged)** · ambos · Antigravity · X-002
`pre-commit`: lint-staged. `pre-push`: `npm run verify` (PAGINA) / `pnpm verify` (AR). Scripts multiplataforma (sin `rm -rf`; usar Node o `rimraf`).
CA: un push con una prueba fallando es rechazado localmente en Windows.

**X-005 — Normalizar Node 22** · ambos · Antigravity · —
`.nvmrc` = `22`, `"engines": { "node": ">=22" }`, CI en Node 22.
CA: CI y local usan Node 22; todo sigue pasando.

**X-006 — Protección de `main` y environments** · ambos · cualquiera (manual en GitHub) · X-007/A-001
Sección 6.3. CA: un push directo a `main` es rechazado; un PR con CI rojo no se puede mergear.

**X-007 — Cuenta y proyecto en Cloudflare Pages** · PAGINA · manual · —
Crear proyecto en modo *Direct Upload* (sin conectar Git), token con permiso mínimo, secretos y variables (sección 6.4).
CA: `deploy.yml` publica un preview desde `dev/Juanjo`.

**X-008 — Dependabot y CodeQL** · ambos · cualquiera · X-002
`.github/dependabot.yml` (npm y github-actions, semanal); habilitar CodeQL default setup.
CA: aparecen en Security → Code scanning y Dependabot.

**X-009 — Cortar la dependencia del Supabase de terceros** · PAGINA · Claude · X-002
Quitar la URL/clave de `vnztoczhwrqjrgatiutz` de `arAssets.js`, `.env.example` y `vercel.json`. Los dos modelos actuales se regeneran en Fase 5 o se usan modelos de prueba propios en `content/`.
CA: `grep -ri vnztoczhwrqjrgatiutz` devuelve 0 resultados; la demo no hace ninguna petición a dominios de terceros.

**X-010 — Limpieza del repo PAGINA** · PAGINA · Antigravity · X-002
Renombrar el paquete (`cocina-de-autor` → `ascua-demo`), sacar `ANIMACION RESTAURANTE.mp4` e `IMAGENES AR/` de la raíz (a `content/` o fuera del repo), retirar `vercel.json`, mover `PRODUCT.md`/`PROYECTO.md` a `docs/` y marcar `PROYECTO.md` como histórico.
CA: raíz limpia; build y lint pasan.

**X-011 — Código que se explica solo** · ambos · Claude (define) + Antigravity (aplica) · X-002
Aplicar la sección "Comentarios y documentación" de `CLAUDE.md`: encabezado en cada archivo, TSDoc en español en todo lo exportado, comentarios del *porqué*, `README.md` corto en cada capa/módulo y `docs/ARQUITECTURA.md` con el recorrido de un toque en "Ver en mi mesa". Se aplica de forma continua: cada tarea deja documentado lo que toca.
CA: un archivo nuevo sin encabezado o un export sin TSDoc se señala en la revisión (`engineering:code-review`); `docs/ARQUITECTURA.md` existe y está al día.

### Fase A — Saneamiento de ARFOODS (en paralelo con Fase P-1)

**A-001 — Arreglar ESLint (CI en rojo)** · AR · Antigravity · X-002
Crear `apps/web/eslint.config.mjs` (flat config con `eslint-config-next`); corregir lo que aparezca.
CA: `pnpm -r lint` en verde; CI completo en verde.

**A-002 — CI endurecido** · AR · Claude · A-001
Reemplazar `ci.yml` por el entregado: Node 22, `PUPPETEER_SKIP_DOWNLOAD`, `typecheck`, cobertura, gitleaks, audit que bloquea en `high` de producción, triggers `dev/**` y PR a `main`; `worker-image.yml` construye la imagen Docker solo si cambia el worker.
CA: todos los jobs en verde en `dev/Juanjo`.

**A-003 — Actualizar `PROJECT_CONTEXT.md`** · AR · Claude · A-001
Reflejar CI real, 10 migraciones, hallazgos ya corregidos, nuevo rol de Estudio 3D.
CA: el documento coincide con el código (verificado con graphify).

**A-004 — Re-auditoría de seguridad** · AR · Claude · A-002
`cyber-neo` (solo lectura) → `docs/seguridad/`. Confirmar qué hallazgos del 28-ago siguen abiertos (CN-004 sharp, CN-006 extract-zip, CN-011/012/013 dev tooling, CN-015 sesión de 1 año, etc.) y crear tareas para los abiertos.
CA: reporte nuevo con estado de cada hallazgo anterior.

**A-005 — Script `verify` en la raíz** · AR · Antigravity · A-001
`pnpm verify` = lint + typecheck + test + build (worker y db; web con variables dummy o `next build` en modo que no requiera Supabase real).
CA: `pnpm verify` corre local y en CI.

### Fase P-1 — Re-arquitectura de PAGINA

**P-101 — TypeScript + herramientas de prueba** · PAGINA · Claude · X-010
`tsconfig` estricto (`strict`, `noUncheckedIndexedAccess`), `allowJs` para migrar gradualmente, Vitest + Testing Library + jsdom, Prettier, scripts: `typecheck`, `test`, `test:coverage`, `verify`. Corregir el warning de oxlint.
CA: `npm run verify` pasa con al menos una prueba de ejemplo.

**P-102 — Capa `domain`** · PAGINA · Claude · P-101
Entidades y esquemas zod: `Restaurant`, `Theme`, `Category`, `Dish`, `Price` (formato COP), `ArAsset`, `DeviceCapabilities`, `ArLaunchMode`; política pura `selectArLaunchMode(device, asset)`.
CA: ≥ 90 % cobertura en `domain/`; cero imports de React o del navegador (verificado por P-108).

**P-103 — Puertos y casos de uso (`application`)** · PAGINA · Claude · P-102
Puertos: `RestaurantRepository`, `ArLauncher`, `EnvironmentDetector`, `SoldOutStore`, `AnalyticsTracker`. Casos de uso: `getRestaurant`, `buildMenuView`, `launchDishAr`, `buildReservationLink`, `toggleSoldOut`.
CA: pruebas con dobles en memoria; ≥ 90 % cobertura.

**P-104 — Adaptadores AR** · PAGINA · Claude · P-103
Migrar `launchAr.js` y `browserEnv.js` a `QuickLookLauncher`, `SceneViewerLauncher`, `ModelViewerFallbackLauncher` y `BrowserEnvironmentDetector`, **preservando exactamente** el comportamiento actual (el `<img>` dentro del `<a rel="ar">`, el `intent://` con fallback, la detección de navegadores embebidos). Pruebas de contrato.
CA: pruebas de contrato verdes; prueba manual en iPhone y Android idéntica a la versión actual.

**P-105 — Repositorio de contenido estático** · PAGINA · Claude · P-103
`StaticJsonRestaurantRepository` con guardia de slug y validación zod de la respuesta.
CA: slugs inválidos (`../x`, mayúsculas, sin sufijo) se rechazan sin hacer `fetch`; JSON inválido → error controlado.

**P-106 — Composition root y router** · PAGINA · Claude · P-104, P-105
`app/compositionRoot.ts`, contexto de dependencias para React, rutas `/`, `/r/:slug`, `/r/:slug/qr`, 404, expirado.
CA: ningún componente importa `infrastructure/`.

**P-107 — Migrar presentación** · PAGINA · Antigravity · P-106
Mover componentes a `presentation/`, dividir `Menu.jsx` (contenedor/presentación), quitar la lógica de negocio de los componentes, i18n leyendo los textos del restaurante.
CA: la UI funciona igual que antes; pruebas de componentes para tarjeta de plato, botón AR y aviso de navegador embebido.

**P-108 — Reglas de arquitectura en CI** · PAGINA · Antigravity · P-106
`dependency-cruiser` con las reglas de la sección 3.1; script `arch:check`.
CA: introducir a propósito un import prohibido hace fallar `npm run verify`.

### Fase P-2 — Multi-restaurante

**P-201 — Esquema de contenido v1** · PAGINA · Claude · P-102
Esquema zod completo (sección 3.4) + `content/restaurants/_plantilla/`.
CA: la plantilla valida; documentado en `docs/runbooks/nuevo-restaurante.md`.

**P-202 — Validador de contenido** · PAGINA · Claude · P-201
`scripts/validate-content.ts`: esquema, slug único y con sufijo, rutas dentro de su carpeta, archivos existentes, pesos (GLB ≤ 5 MB, USDZ ≤ 8 MB, imágenes ≤ 300 KB, WebP), `aprobado: true` obligatorio para publicar modelo, `autorizacion` presente, hashes repetidos entre restaurantes (advertencia), restaurantes expirados (advertencia).
CA: pruebas del validador con casos válidos e inválidos; corre en `verify` y en CI.

**P-203 — Build de contenido y HTML por restaurante** · PAGINA · Claude · P-202
`scripts/build-content.ts`: copia a `dist/data/<slug>/` y genera `dist/r/<slug>/index.html` con `<title>`, descripción, OpenGraph y `noindex`. `_redirects` para la SPA.
CA: compartir `/r/<slug>/` por WhatsApp muestra el nombre del restaurante en la vista previa.

**P-204 — Pruebas E2E de aislamiento** · PAGINA · Claude · P-203
Dos restaurantes de prueba en `tests/fixtures`. Playwright verifica que `/r/A/` nunca pide `/data/B/`, 404 para slug inexistente, página de "demo finalizada" para expirado.
CA: pruebas verdes en los 3 proyectos (Desktop, Pixel, iPhone).

**P-205 — Página de QR imprimible** · PAGINA · Antigravity · P-203
`/r/<slug>/qr` con el QR (librería `qrcode`), nombre y logo; estilos de impresión.
CA: el QR impreso abre la carta correcta desde ambos celulares.

### Fase P-3 — Funciones de la demo

**P-301 — Reservas por WhatsApp** · PAGINA · Antigravity · P-107
Reemplaza el formulario simulado: arma un mensaje prellenado (`wa.me/<numero>?text=…`, codificado). Sin backend.
CA: abre WhatsApp con el texto correcto en ambos celulares; prueba unitaria de `buildReservationLink`.

**P-302 — Modo presentación (agotados)** · PAGINA · Antigravity · P-107
Con `?demo=1` aparece un panel para marcar platos como agotados (solo `localStorage`, por slug).
CA: el estado de un restaurante no afecta a otro; sin `?demo=1` el panel no existe en el DOM.

**P-303 — Feedback** · PAGINA · Antigravity · P-107
Botón que abre un formulario gratuito (Tally o Google Forms) con el slug como campo oculto.
CA: las respuestas llegan identificadas por restaurante.

**P-304 — Analítica sin cookies** · PAGINA · Antigravity · P-203
Cloudflare Web Analytics (visitas por ruta = por restaurante). Puerto `AnalyticsTracker` con implementación `Noop` en pruebas. Sin datos personales.
CA: el panel de Cloudflare muestra visitas por `/r/<slug>/`.

**P-305 — Legal visible** · PAGINA · Antigravity · P-107
Disclaimer Ley 1480 en el visor, aviso de privacidad mínimo (sin cookies ni datos personales), pie "Hecho por PITS · Ascua".
CA: visible en móvil y escritorio.

**P-306 — Guía antes de abrir la cámara** · PAGINA · Claude · P-104, P-107
Pantalla ilustrada de 3 pasos (sección 3.6). Se muestra la primera vez por dispositivo (`localStorage`) y su botón es el gesto que lanza Quick Look/Scene Viewer. Accesible luego desde "¿Cómo funciona?".
CA: E2E de primera/segunda visita; QA en ambos celulares confirma que el AR abre desde el botón de la guía; textos revisados por alguien no técnico.

**P-307 — Medida real por plato en el AR** · PAGINA · Claude · P-104, A-204
Los launchers usan los modelos normalizados por plato y conservan la escala fija (`allowsContentScaling=0`, `resizable=false`). El validador (P-202) exige `escalaRealCm` y compara con las dimensiones del `manifest.json` (tolerancia ± 5 %).
CA: una pizza y un postre aparecen sobre la mesa con su tamaño real en ambos celulares; un modelo con medida que no coincide hace fallar el validador.

**P-308 — Ayuda contextual y estados** · PAGINA · Antigravity · P-107
Botón fijo "¿Cómo funciona?", pista de primera visita, estados de carga/error/sin conexión/agotado con textos simples y una acción clara. Visor 3D de respaldo con encuadre cuidado.
CA: cada estado tiene prueba de componente; ningún mensaje de error muestra códigos técnicos al comensal.

### Fase P-4 — Diseño

**P-401 — Tokens desde DESIGN.md** · PAGINA · Claude · P-107 + DESIGN.md cargado por Juan
Traducir `docs/DESIGN.md` a tokens (CSS variables + Tailwind) en `presentation/theme/`.
CA: ningún color/tipografía "quemado" en componentes (verificable con grep de valores hex fuera de `theme/`).

**P-402 — Tema por restaurante** · PAGINA · Antigravity · P-401
El restaurante solo sobreescribe color primario, par tipográfico (lista cerrada) y logo. Contraste mínimo AA verificado al validar contenido.
CA: un color primario con contraste insuficiente hace fallar el validador.

**P-403 — Rediseño de componentes** · PAGINA · Antigravity · P-401
Aplicar el diseño **sin tocar** los adaptadores AR.
CA: `design:design-critique` sin problemas mayores; E2E verdes.

**P-404 — Accesibilidad** · PAGINA · Claude · P-403
`design:accessibility-review` + axe en E2E.
CA: 0 violaciones serias/críticas.

**P-405 — Mobile-first y responsive** · PAGINA · Antigravity · P-403
Aplicar las reglas de la sección 3.5: diseño desde 360 px, áreas táctiles ≥ 48 px, zonas seguras, sin *hover*, `prefers-reduced-motion`.
CA: pruebas de responsive verdes en los 5 anchos; revisión visual en ambos celulares.

**P-406 — Prueba de usabilidad con personas no técnicas** · PAGINA · manual (Juan) + Claude para el guion · P-306, P-308, P-405
5 personas (idealmente mayores o poco familiarizadas con apps). Tareas: abrir el QR, encontrar un plato, verlo sobre la mesa, reservar por WhatsApp. Sin ayuda; se anota dónde dudan. Guion y plantilla en `docs/runbooks/prueba-usabilidad.md`.
CA: ≥ 4 de 5 completan "ver un plato sobre la mesa" sin ayuda; los puntos de duda se convierten en tareas.

### Fase 5 — Estudio 3D (repo AR)

**A-201 — Investigación de generadores gratuitos** · AR · Claude · —
Comparar 2–3 generadores (TRELLIS, Hunyuan3D, escaneo con fotogrametría) con 3 platos de prueba; registrar licencias de uso comercial en `docs/licencias/`.
CA: ADR con el generador elegido y su licencia archivada.

**A-202 — CLI `build-asset`** · AR · Claude · A-005
`apps/worker/src/cli/build-asset.ts` + script `pnpm asset:build -- --input <glb|foto> --out <dir> --escala-cm <n>`. Reutiliza normalize-scale, optimize, usdz (Docker) y poster. Escribe `manifest.json` (pesos, SHA-256, dimensiones, escala, generador, licencia).
CA: con un fixture produce los 4 archivos dentro de los presupuestos de peso; pruebas de integración.

**A-203 — Runbook de producción de modelos** · AR · Antigravity · A-202
`docs/runbooks/produccion-modelo-3d.md`: cómo tomar la foto, generar, limpiar en Blender, correr la CLI, QA en dispositivos, copiar a PAGINA y marcar `aprobado`.
CA: Juan produce un modelo siguiendo solo el runbook.

**A-204 — Normalización por plato** · AR · Claude · A-202
Reemplazar la escala fija de 16 cm por `--escala-cm` de cada plato; origen en el centro de la base (y = 0), orientación frontal, eliminación de fragmentos sueltos. `manifest.json` registra el tamaño resultante en cm (ancho, alto, profundidad).
CA: pruebas con fixtures de distinto tamaño; el lado más largo del modelo coincide con `--escala-cm` (± 1 %) y su base queda en y = 0.

### Fase 6 — Contenido de la demo

**P-601 — Demo genérica `ascua-demo`** · PAGINA · manual + cualquiera · P-2, A-202
4–5 platos con volumen y acabado mate, todos aprobados.
CA: checklist de QA de dispositivos firmado.

**P-602 — Primeros 3 restaurantes** · PAGINA · manual + cualquiera · P-601
Autorización escrita, 3 platos cada uno, tema propio, QR impreso.
CA: cada uno validado, aislado y probado en ambos celulares.

### Fase 7 — Endurecimiento y lanzamiento v1.0.0

**P-701 — Cabeceras de seguridad para Cloudflare** · PAGINA · Claude · P-203
`public/_headers`: CSP solo con dominios propios (y los estrictamente necesarios para analítica/formulario), HSTS, `nosniff`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`; tipos de contenido `model/gltf-binary` y `model/vnd.usdz+zip`; caché inmutable para assets con hash.
CA: securityheaders.com o similar sin fallos graves; AR sigue funcionando.

**P-702 — Presupuesto de rendimiento** · PAGINA · Antigravity · P-403
Lighthouse CI con umbrales (sección 5.1); carga diferida de model-viewer y GSAP.
CA: umbrales cumplidos en CI.

**P-703 — Auditoría de seguridad pre-release** · PAGINA · Claude · P-701
`cyber-neo` + `/security-review`.
CA: 0 críticos/altos abiertos.

**P-704 — Licencias de dependencias** · PAGINA · Antigravity · P-101
`license-checker --production --failOn "GPL;AGPL"` en CI.
CA: CI falla si entra una dependencia con licencia prohibida.

**P-705 — Release v1.0.0** · PAGINA · Claude · todo lo anterior
`engineering:deploy-checklist`, PR a `main`, smoke en producción, tag `v1.0.0`, `CHANGELOG.md`.
CA: producción sirve la demo genérica y los 3 restaurantes; runbook de rollback probado una vez en preview.

### Fase 8 — Plataforma ARFOODS (solo después de validar)

**A-301** ADR de hosting de producción (Vercel Pro vs. Cloudflare Workers/OpenNext). **A-302** Dos proyectos Supabase (`dev`/`prod`) + Supabase CLI. **A-303** Estructura `src/modules/*` (un módulo por PR, empezando por `qr` y `menu`). **A-304** Controladores delgados + validación zod en todas las rutas de API. **A-305** E2E con Playwright (menú público y panel). **A-306** Pruebas de aislamiento RLS con dos usuarios. **A-307** Importar el contenido de la demo de PAGINA al menú multi-restaurante (`content/` → tablas). **A-308** Sesión de 1 año (CN-015): política de re-autenticación. **A-309** Activar el pipeline 3D en servidor solo con un generador de pago y SLA.
(Se detallan con criterios de aceptación al iniciar la fase.)

---

## 10. Definición de terminado (DoD) — aplica a toda tarea

- [ ] Criterios de aceptación de la tarea cumplidos.
- [ ] `npm run verify` / `pnpm verify` en verde **local** antes del push.
- [ ] Pruebas nuevas para el código nuevo; regresión para cada bug.
- [ ] Código documentado: encabezado de archivo, TSDoc en español en lo exportado, comentarios del porqué (CLAUDE.md §4.1).
- [ ] Si toca UI: funciona en 360 px, áreas táctiles ≥ 48 px, textos sin tecnicismos.
- [ ] Sin `console.log` de depuración, sin `TODO` sin ID de tarea, sin código comentado.
- [ ] Sin secretos ni datos personales en el diff.
- [ ] Regla de capas respetada (`arch:check`).
- [ ] `engineering:code-review` y `/security-review` sobre el diff sin hallazgos altos.
- [ ] Docs actualizadas (README/runbook/ADR si aplica) y `docs/ESTADO.md` al día.
- [ ] Bitácora de la sesión en `docs/sesiones/` y grafo actualizado.
- [ ] CI en verde en `dev/Juanjo`; si toca AR o contenido, QA manual en ambos celulares sobre el preview.

---

## 11. Riesgos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Calidad de modelos con generadores gratuitos | Alto (credibilidad) | Elegir platos aptos; 2–3 generadores por plato; limpieza en Blender; `aprobado` obligatorio; si no sale bien, el plato va solo con foto. |
| La refactorización rompe el AR que hoy funciona | Alto | P-104 preserva el comportamiento exacto con pruebas de contrato + QA manual antes de seguir. |
| Cuota semanal de Claude insuficiente | Medio | Tareas pequeñas, ESTADO.md, graphify, Antigravity para tareas mecánicas. |
| Cambios en planes gratuitos (Cloudflare, generadores) | Medio | Todo es estático y portable a cualquier hosting estático (Netlify, GitHub Pages). |
| Uso de fotos/cartas sin autorización | Medio-alto (legal) | Campo `autorizacion` obligatorio + borrado al expirar. |
| Comensales no técnicos se pierden o no entienden el AR | Alto | Guía previa (P-306), lenguaje sin tecnicismos, ayuda fija, prueba de usabilidad (P-406). |
| El plato abre demasiado grande o pequeño | Alto | Medida real por plato + origen en la base (A-204, P-307) y escala fija. |
| Sobreingeniería en una demo | Medio | Fases P-1/P-2 son la base mínima; lo demás se agrega solo si la validación lo justifica (`ponytail` lite). |

---

## 12. Registro de cambios del plan

| Fecha | Versión | Cambio |
|---|---|---|
| 2026-10-05 | 1.0 | Versión inicial. |
| 2026-10-05 | 1.1 | Experiencia móvil e intuitiva (§3.5), experiencia AR con medida real por plato y guía previa (§3.6), código auto-explicativo (X-011). Nuevas tareas P-306, P-307, P-308, P-405, P-406, A-204, X-011. |
