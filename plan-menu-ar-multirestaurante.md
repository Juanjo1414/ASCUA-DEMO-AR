# Plan de implementación — Menú AR multi-restaurante

> Documento para pasarle a Claude Code fase por fase. Cada fase trae: objetivo, entregable, prompt sugerido y criterio de aceptación. No le des todo de una vez.

---

## 0. Aclaración importante antes de empezar

**El código QR no se regenera cuando actualizas el menú.** El QR apunta a una URL permanente (`https://tudominio.com/m/la-fonda`) y el contenido detrás de esa URL se actualiza solo. Un restaurante imprime su QR una única vez, en la vida.

Solo se genera un QR nuevo cuando:

- Se da de alta un **restaurante nuevo** (QR nuevo, slug nuevo).
- El restaurante quiere **QR por mesa** (`/m/la-fonda?mesa=7`) para analítica o pedidos futuros.

Para que esto sea cierto incluso si el restaurante cambia de nombre, el QR se imprime apuntando a un **enlace corto inmutable** (`/r/{id_corto}`) que redirige al slug actual. Así el slug puede cambiar mil veces y el papel impreso sigue funcionando.

---

## 1. Arquitectura (resumen ejecutivo)

Dos planos separados:

| Plano | Quién lo usa | Naturaleza | Latencia objetivo |
|---|---|---|---|
| Público (`/m/[slug]`) | Comensal | Estático, pre-renderizado, servido desde CDN | < 1.5 s |
| Panel (`/admin`) | Restaurante | Dinámico, autenticado, RLS por tenant | irrelevante |
| Worker | Nadie (background) | Cola asíncrona: foto → 3D → optimización → publicación | 1-5 min |

**Regla de oro:** el comensal jamás espera por cómputo. Todo lo pesado ocurre en el worker, antes.

### Stack

| Capa | Elección | Nota |
|---|---|---|
| Framework | Next.js 15 (App Router, TypeScript) | Menú público con ISR + `revalidateTag` |
| Estilos | Tailwind CSS | |
| DB + Auth + Storage | Supabase | Un solo proveedor para el MVP |
| Visor 3D/AR | `<model-viewer>` v4 (carga diferida) | ARKit (iOS) + Scene Viewer (Android) |
| Generación 3D | Interfaz `Generator` → TripoSR (gratis) hoy, Meshy mañana | Intercambiable en una línea |
| Optimización | `gltf-transform` CLI | 15 MB → 1-2 MB |
| USDZ | `usd_from_gltf` en Docker | iOS sin necesitar Mac |
| QR | `qrcode` (npm), generado en el servidor | PNG + SVG descargable |
| Hosting | Vercel (web) + Fly.io/Railway o Colab (worker) | Free tier suficiente para la demo |

### Estructura del repo

```
menu-ar/
├─ apps/
│  ├─ web/                  # Next.js: menú público + panel admin
│  │  ├─ app/
│  │  │  ├─ m/[slug]/page.tsx        # menú público (ISR)
│  │  │  ├─ r/[shortId]/route.ts     # redirect inmutable del QR
│  │  │  ├─ admin/                   # panel autenticado
│  │  │  └─ api/
│  │  │     ├─ jobs/route.ts         # encolar generación
│  │  │     └─ webhooks/job-done/route.ts
│  │  └─ components/
│  │     ├─ DishCard.tsx
│  │     └─ ArViewer.tsx             # model-viewer diferido
│  └─ worker/               # generación 3D + optimización + usdz
│     ├─ src/generators/{triposr.ts, meshy.ts, index.ts}
│     ├─ src/pipeline/{optimize.ts, usdz.ts, upload.ts}
│     └─ Dockerfile
└─ packages/db/             # esquema SQL + tipos generados
```

---

## 2. Modelo de datos

Multi-tenant desde el día uno. Todo cuelga de `restaurant_id` y se protege con RLS.

```sql
-- Restaurantes (tenants)
create table restaurants (
  id            uuid primary key default gen_random_uuid(),
  short_id      text unique not null,          -- 6 chars, para el QR: /r/{short_id}
  slug          text unique not null,          -- la-fonda-envigado
  name          text not null,
  logo_url      text,
  brand_color   text default '#111111',
  currency      text default 'COP',
  is_published  boolean default false,
  owner_id      uuid references auth.users(id),
  created_at    timestamptz default now()
);

create table categories (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  name          text not null,
  position      int  not null default 0
);

create table dishes (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  category_id   uuid references categories(id) on delete set null,
  name          text not null,
  description   text,
  price_cents   bigint not null default 0,
  photo_url     text,                          -- foto original (2D)
  position      int  not null default 0,
  is_available  boolean default true,
  updated_at    timestamptz default now()
);

-- Assets 3D: separados del plato porque tienen ciclo de vida propio
create table dish_assets (
  id            uuid primary key default gen_random_uuid(),
  dish_id       uuid not null references dishes(id) on delete cascade,
  glb_url       text,
  usdz_url      text,
  poster_url    text,                          -- webp que se ve en el menú
  triangles     int,
  bytes_glb     int,
  generator     text,                          -- 'triposr' | 'meshy'
  is_active     boolean default false,         -- permite versionar y hacer rollback
  created_at    timestamptz default now()
);

-- Cola de trabajos
create type job_status as enum ('queued','processing','done','failed');

create table jobs (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  dish_id       uuid not null references dishes(id) on delete cascade,
  source_photo  text not null,
  status        job_status not null default 'queued',
  attempts      int default 0,
  error         text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

create index on jobs (status, created_at);
create index on dishes (restaurant_id, position);
```

**RLS obligatorio** (si no, un restaurante ve el menú de otro):

```sql
alter table restaurants enable row level security;
alter table dishes enable row level security;
alter table dish_assets enable row level security;
alter table jobs enable row level security;

-- Lectura pública solo de restaurantes publicados
create policy "public read published" on restaurants
  for select using (is_published = true);

-- El dueño manda sobre lo suyo
create policy "owner all" on restaurants
  for all using (owner_id = auth.uid());

create policy "owner dishes" on dishes
  for all using (
    exists (select 1 from restaurants r
            where r.id = dishes.restaurant_id and r.owner_id = auth.uid())
  );
```

> El menú público **no lee con la clave anónima en el navegador**: lo lee el servidor en build/ISR con service role y lo entrega ya renderizado. Menos latencia y cero superficie de ataque.

---

## 3. Fases

### Fase 0 — Base legal (paralela a la Fase 1, no la bloquea)

**Objetivo:** que el código nazca sobre supuestos legales correctos, porque tres de ellos condicionan decisiones técnicas.

| Tarea | Por qué toca hacerla ahora |
|---|---|
| Verificar la licencia vigente del generador que elijas y guardar copia en PDF | Define si puedes usar los modelos comercialmente (ver 6.2) |
| Decidir que el comensal **no** es titular de datos personales | Condiciona el diseño: sin login, sin cookies, sin analítica identificable |
| Redactar la leyenda "modelo referencial" | Va dentro del componente `ArViewer` de la Fase 3 |
| Registro de soporte lógico ante la DNDA | Trámite barato; te da fecha cierta de autoría del código |
| Auditoría de licencias en CI | Una dependencia AGPL te obligaría a liberar todo tu código |

**Prompt para Claude Code:**
> Añade a CI un paso que genere `THIRD_PARTY_LICENSES.md` con `license-checker --production` y que falle el build si detecta licencias GPL o AGPL en dependencias de producción. Crea la ruta `/licencias` que muestre ese archivo, y las rutas `/terminos`, `/privacidad` y `/subprocesadores` como páginas estáticas de contenido en MDX, enlazadas desde el pie del menú público y del panel.

**Aceptación:** el build falla si alguien mete una dependencia AGPL, y las cuatro rutas legales existen aunque el contenido esté en borrador.

---

### Fase 1 — Esqueleto y base de datos

**Objetivo:** proyecto corriendo, esquema aplicado, tipos generados.

**Entregable:** `apps/web` con Next.js 15 + TS + Tailwind, Supabase conectado, migración SQL aplicada, seed con 1 restaurante de prueba y 6 platos (sin 3D todavía).

**Prompt para Claude Code:**
> Crea un monorepo con pnpm workspaces: `apps/web` (Next.js 15 App Router, TypeScript, Tailwind) y `packages/db`. En `packages/db` pon la migración SQL que te paso [pega la sección 2] y un script `seed.ts` que cree un restaurante demo con 2 categorías y 6 platos. Configura el cliente de Supabase con dos variantes: `createServerClient()` con service role para el menú público y `createBrowserClient()` con anon key para el panel. Genera los tipos con `supabase gen types`.

**Aceptación:** `pnpm dev` levanta, el seed corre, `select * from dishes` devuelve 6 filas.

---

### Fase 2 — Menú público (sin AR todavía)

**Objetivo:** la página que ve el comensal, rápida y bonita, con la foto 2D.

Claves técnicas que no se negocian:

- `export const revalidate = 3600` + `generateStaticParams()` para los restaurantes publicados.
- Imágenes con `next/image`, formato WebP, `sizes` correcto, `priority` solo en las 2 primeras.
- **Cero JavaScript de cliente en esta página** salvo el botón de AR (fase 3).
- Layout: categorías como pestañas ancladas (scroll spy con CSS `scroll-margin`, sin JS).

**Prompt para Claude Code:**
> Implementa `app/m/[slug]/page.tsx` como Server Component con ISR de 1 hora y `generateStaticParams`. Debe listar categorías y platos con foto, nombre, descripción y precio formateado en COP. Diseño mobile-first, tarjetas limpias, colores tomados de `restaurants.brand_color`. Si el restaurante no existe o no está publicado, `notFound()`. Añade `app/r/[shortId]/route.ts` que busque el `short_id` y haga `redirect(307)` a `/m/{slug}`.

**Aceptación:** Lighthouse mobile ≥ 95 en Performance, JS inicial < 100 KB, la página se ve bien en un celular real.

---

### Fase 3 — Visor AR con modelos puestos a mano

**Objetivo:** validar la experiencia completa QR → menú → AR **antes** de construir el pipeline automático.

Genera 3 o 4 modelos manualmente, pásalos por `gltf-transform` y súbelos a mano al bucket. Escribe las URLs directo en `dish_assets`.

> ⚠️ **Cambio reciente:** el plan gratuito de Meshy **ya no permite descargar** los modelos generados — al hacer clic en descargar aparece un muro de pago. La ruta gratuita viable hoy es el Space de **TripoSR** en Hugging Face. Si prefieres calidad desde el arranque, es el momento de pagar Meshy Pro ($20/mes). Verifica el estado de ambas licencias el día que empieces (ver sección 6.2).

**El componente crítico:**

```tsx
'use client';
import { useState } from 'react';

export function ArViewer({ glb, usdz, poster, alt }: Props) {
  const [loaded, setLoaded] = useState(false);

  const load = async () => {
    await import('@google/model-viewer'); // ~150 KB, solo al tocar
    setLoaded(true);
  };

  if (!loaded) {
    return (
      <button onClick={load} className="...">
        <img src={poster} alt={alt} loading="lazy" />
        <span>Ver en 3D / AR</span>
      </button>
    );
  }

  return (
    <model-viewer
      src={glb}
      ios-src={usdz}
      poster={poster}
      alt={alt}
      ar
      ar-modes="webxr scene-viewer quick-look"
      ar-scale="fixed"          /* el plato debe verse a tamaño real */
      ar-placement="floor"
      camera-controls
      touch-action="pan-y"
      shadow-intensity="1"
      reveal="manual"
    />
  );
}
```

- `ar-scale="fixed"` es lo que hace creíble la demo: el comensal quiere ver **la porción real**, no un plato escalable. Además es una exigencia legal de facto: un modelo a escala mayor que el plato servido es publicidad engañosa (ver 6.4).
- El `.glb` no se descarga hasta que tocan el botón. Esto es lo que mantiene el menú en 400 KB.
- **Obligatorio:** leyenda visible bajo el visor — *"Modelo referencial. La presentación puede variar."* No es un detalle de diseño, es la mitigación más barata del riesgo de consumo.

**Prompt para Claude Code:**
> Crea `components/ArViewer.tsx` como client component con import dinámico de `@google/model-viewer` disparado por el click. Antes del click muestra solo el poster WebP. Declara el tipo de `model-viewer` en `types/model-viewer.d.ts` para que TS no se queje. Intégralo en `DishCard` solo cuando el plato tenga un `dish_assets` con `is_active = true`.

**Aceptación:** desde un iPhone y un Android reales, escaneas el QR, tocas un plato y el modelo aparece sobre la mesa a escala correcta.

> ⚠️ Prueba en dispositivos reales, no en el simulador. iOS necesita el `.usdz`; si falta, el botón de AR no aparece y parece un bug del código cuando en realidad es un asset faltante.

---

### Fase 4 — Panel del restaurante

**Objetivo:** que un dueño de restaurante, sin conocimientos técnicos, arme su menú en 20 minutos.

Pantallas mínimas:

1. **Login** — Supabase Auth con magic link (sin contraseñas que olvidar).
2. **Mi restaurante** — nombre, logo, color, moneda, botón "Publicar".
3. **Menú** — lista de categorías y platos con drag & drop para reordenar (`dnd-kit`), edición inline.
4. **Plato** — nombre, descripción, precio, disponibilidad, foto, y el botón que dispara la generación 3D.
5. **Mi QR** — vista previa del QR, descarga en PNG (para pantallas) y SVG (para imprenta), con el logo del restaurante en el centro.

**Sobre "escanear una imagen nueva al seleccionar el producto":** en el detalle del plato va un botón **"Capturar plato"** que abre la cámara del celular directamente (`<input type="file" accept="image/*" capture="environment">`). El mesero o el dueño para el celular sobre el plato, toma la foto, y esa misma pantalla muestra el estado: *En cola → Generando → Listo*. No hay que salir a ningún lado ni entender qué es un GLB.

Guía de captura embebida en esa pantalla (esto sube la calidad del 3D más que cualquier cambio de modelo):

- Fondo liso y contrastante (mantel blanco, mesa oscura).
- Luz difusa, sin flash directo ni sombras duras.
- Ángulo de 30-45°, el plato ocupando el 80% del encuadre.
- Nada más en cuadro: ni cubiertos, ni manos, ni vasos.

Dos requisitos legales que viven en esta pantalla:

- **Garantía de titularidad al subir:** casilla obligatoria la primera vez que el restaurante sube una foto — *"Declaro que soy titular de esta imagen o cuento con autorización para usarla, y que no incluye personas identificables sin su consentimiento."* Guarda quién la aceptó y cuándo. La licencia del modelo 3D es tan válida como la licencia de la foto de entrada.
- **Aprobación explícita del modelo:** ningún `.glb` se publica automáticamente. El dueño ve una vista previa y aprueba. Ese clic queda registrado en `audit_log` y es tu evidencia si alguien reclama que el plato no se parecía al 3D.

**Prompt para Claude Code:**
> Construye el panel en `app/admin` con Supabase Auth (magic link) y middleware que proteja las rutas. CRUD de categorías y platos con optimistic updates, reordenamiento con `dnd-kit` persistiendo el campo `position`. En el detalle del plato, un input de archivo con `capture="environment"` que sube a Supabase Storage y llama a `POST /api/jobs`. Muestra el estado del job con polling cada 3 s mientras esté en `queued` o `processing`. Todo mobile-first: el dueño va a usar esto desde el celular, de pie, en el restaurante.

**Aceptación:** creas un restaurante nuevo, armas un menú de 8 platos y lo publicas sin tocar la base de datos ni una línea de código.

---

### Fase 5 — Pipeline asíncrono de generación 3D

**Objetivo:** foto → `.glb` optimizado + `.usdz` + poster, sin intervención humana.

Flujo del worker (loop cada 10 s sobre `jobs` en estado `queued`):

```
1. claim job     → UPDATE jobs SET status='processing' ... RETURNING  (evita doble toma)
2. descarga foto  → strip EXIF antes de almacenar (las fotos de celular traen GPS;
                    la ubicación exacta de la cocina es un dato que no quieres tener)
3. generator.generate(photo) → glb crudo (10-20 MB)
4. gltf-transform optimize:
     --simplify 0.5 --texture-compress webp --texture-size 1024 --compress meshopt
5. usd_from_gltf → .usdz
6. render de poster.webp (headless con three.js o screenshot de model-viewer)
7. sube los 3 archivos al bucket con nombre hasheado + Cache-Control immutable
8. INSERT dish_assets (is_active=FALSE, pendiente de aprobación del dueño)
   → solo al aprobar desde el panel pasa a is_active=true y el anterior a false
9. POST al webhook de revalidación → revalidateTag(`restaurant:${id}`)
10. status='done'   (o 'failed' con error, y reintento hasta attempts=3)
```

La abstracción que te salva después:

```ts
// worker/src/generators/index.ts
export interface Generator {
  name: string;
  generate(photoUrl: string): Promise<Buffer>; // glb crudo
}

export const generator: Generator =
  process.env.GENERATOR === 'meshy' ? meshyGenerator : triposrGenerator;
```

Cambiar de TripoSR gratis a Meshy Pro el día que tengas un cliente pagando = una variable de entorno.

**Prompt para Claude Code:**
> Crea `apps/worker` en Node + TypeScript con un loop que reclame jobs de forma atómica con `UPDATE ... WHERE status='queued' ... RETURNING`. Implementa la interfaz `Generator` con dos adaptadores: `triposr` (llama a un endpoint de Hugging Face Space o a un Colab expuesto con ngrok) y `meshy` (API oficial, image-to-3d con polling). Después de generar, corre `gltf-transform` como subproceso con los flags que te doy, luego `usd_from_gltf` desde el Dockerfile, sube todo a Supabase Storage y actualiza `dish_assets` y `jobs`. Reintentos con backoff exponencial, máximo 3. Incluye el Dockerfile con Node + Python + USD.

**Aceptación:** subes una foto desde el panel y en menos de 5 minutos el plato tiene botón de AR funcional, con el `.glb` pesando menos de 2 MB.

---

### Fase 6 — Alta de restaurantes en autoservicio

**Objetivo:** que sumar el restaurante número 50 no te cueste ni un minuto de trabajo manual.

- Formulario público `/registro`: nombre del restaurante, correo, listo. Genera `slug` (con desambiguación si choca) y `short_id` de 6 caracteres.
- Al publicar por primera vez, el sistema genera el QR y lo deja descargable en PDF con instrucciones de impresión (tamaño mínimo 3×3 cm, márgenes, "escanea para ver los platos en 3D").
- Plantillas de menú precargadas por tipo de cocina, para que el dueño no arranque de una pantalla vacía.
- **Aceptación de T&C con versión y sello de tiempo.** Guarda `terms_version`, `accepted_at` e IP en la fila del restaurante. Cuando cambies los términos, incrementa la versión y pide reaceptación al siguiente login. Sin esto no tienes contrato oponible con nadie.

**Prompt para Claude Code:**
> Implementa `/registro` que cree el restaurante en estado `is_published=false` con `slug` único y `short_id` de 6 caracteres alfanuméricos sin ambiguos (sin 0/O/1/l). Añade `/admin/qr` que genere el QR con la librería `qrcode` apuntando a `/r/{short_id}`, con el logo del restaurante al centro, descargable en PNG 1024px, SVG y un PDF A6 listo para imprimir.

**Aceptación:** un usuario nuevo se registra, arma su menú y descarga su QR sin que tú intervengas.

---

### Fase 7 — Rendimiento, caché y observabilidad

- **Revalidación quirúrgica:** `revalidateTag('restaurant:{id}')` al guardar cualquier cambio. Nada de revalidar todo el sitio.
- **Cache headers en assets:** `public, max-age=31536000, immutable` con hash en el nombre del archivo. Un modelo nunca se re-descarga.
- **Presupuesto medido en CI:** falla el build si el JS inicial pasa de 100 KB o si algún `.glb` publicado pasa de 3 MB.
- **Métricas mínimas** (tabla `events`, sin cookies ni PII): vistas de menú, toques en "Ver en AR", sesiones AR completadas, plato más visto. Esto es tu argumento de venta al restaurante: *"tus clientes vieron el ajiaco en 3D 340 veces este mes"*.

| Métrica | Objetivo |
|---|---|
| QR → menú visible | < 1.5 s en 4G |
| JS inicial | < 100 KB |
| Peso del menú (20 platos) | < 400 KB |
| `.glb` por plato | < 2 MB |
| Toque en AR → plato en la mesa | < 3 s |

---

### Fase 8 — Demo lista para mostrar

Checklist antes de sentarte con un restaurante:

- [ ] Un restaurante piloto real con 8-10 platos y al menos 5 con modelo 3D.
- [ ] QR impreso en un acrílico de mesa, no en una hoja arrugada.
- [ ] Probado en iPhone y en Android de gama media, con datos móviles (no wifi).
- [ ] Un plato con "antes y después": la foto 2D del menú de papel vs. el 3D. El contraste es la venta.
- [ ] Plan B offline: video grabado de la experiencia, por si el internet del local falla.
- [ ] Leyenda "modelo referencial" visible en el visor.
- [ ] Licencia del generador verificada y archivada en PDF.
- [ ] Contrato de licencia y contenido listo para firmar con el piloto.
- [ ] Rutas `/terminos`, `/privacidad` y `/licencias` publicadas.

---

## 4. Variables de entorno

```bash
# web
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
REVALIDATE_SECRET=

# worker
GENERATOR=triposr            # triposr | meshy
TRIPOSR_ENDPOINT=
MESHY_API_KEY=
SUPABASE_SERVICE_ROLE_KEY=
WEB_WEBHOOK_URL=
```

---

## 5. Costos reales

| Concepto | Demo | 10 restaurantes |
|---|---|---|
| Vercel | $0 | $0-20 |
| Supabase | $0 (500 MB DB, 1 GB storage) | $25 (Pro) |
| Worker | $0 (Colab/HF Space) | $5-10 (Fly.io) |
| Generación 3D | $0 (TripoSR) | $20 (Meshy Pro, ~40 platos/mes) |
| **Total** | **$0** | **~$50-75/mes** |

Costos legales de una sola vez, aparte: registro de soporte lógico ante la DNDA (trámite menor), registro de marca ante la SIC (una tasa por clase), constitución de SAS y revisión de los T&C por abogado. Ninguno bloquea la demo; los tres primeros sí van antes de cobrarle a alguien.

Con 10 restaurantes a $30-50 USD/mes cada uno, el margen es cómodo desde el primer cliente.

---

## 6. Legal y propiedad intelectual

> No soy abogado y esto no es asesoría legal. Es el mapa de lo que hay que resolver y en qué orden, para que llegues donde un abogado con el 80% hecho y le pagues por revisar, no por redactar. Antes de firmar con restaurantes, que un abogado en propiedad intelectual y protección de datos revise lo de 6.3.

### 6.1 Quién es dueño de qué

| Activo | Titular | Cómo lo aseguras |
|---|---|---|
| Código fuente | Tú (o la SAS) | Protegido como obra literaria desde su creación (Ley 23 de 1982, Decisión Andina 351). Registro de soporte lógico ante la DNDA como prueba de fecha y autoría |
| Marca y diseño | Tú | Registro ante la SIC, clases Niza 9, 42 y 35 |
| Fotos de los platos | El restaurante | Licencia no exclusiva a tu favor, por contrato |
| Recetas y descripciones | El restaurante | Cláusula de contenido en el contrato |
| **Modelos 3D generados por IA** | **Zona gris — ver abajo** | Contrato + control técnico, no derecho de autor |
| Métricas agregadas y anónimas | Tú | Declararlo en los T&C |

**El punto delicado.** La DNDA sostiene que los resultados generados por sistemas de IA no son inscribibles en el Registro Nacional del Derecho de Autor, porque la norma colombiana solo reconoce como autor a la persona natural y exige originalidad humana. Desde 2023 ha negado varios registros de obras generadas con IA por ausencia de intervención creativa concreta.

Consecuencia práctica: no construyas tu defensa sobre "los modelos 3D son míos por derecho de autor" — probablemente no sean de nadie. Protégelos con las tres capas que sí funcionan:

1. **Contrato.** Define quién usa los archivos, dónde y hasta cuándo. Es lo que realmente te protege.
2. **Control técnico.** Los `.glb` viven en tu bucket, tras URLs hasheadas, servidos solo desde tu dominio. No hay botón de descarga.
3. **Secreto empresarial** (Decisión Andina 486) sobre el pipeline: parámetros de generación, preprocesamiento y optimización son know-how protegible mientras lo mantengas confidencial.

A tu favor juega que el modelo publicado no sale crudo de la IA: pasa por simplificación de malla, compresión, escalado a tamaño real y curaduría humana. Ese trabajo puede sostener un argumento de originalidad sobre *la versión publicada*. Por eso el pipeline guarda el `.glb` crudo, el optimizado y el registro de quién aprobó cada uno.

### 6.2 Licencias de terceros

**Meshy.** Depende del plan y **cambió hace poco**:

- Plan de pago: conservas propiedad privada de los assets, siempre que no los publiques en su comunidad y que la foto de entrada no infrinja derechos de terceros.
- Plan gratuito: los modelos quedan bajo CC BY 4.0 — permite uso comercial pero exige atribución a Meshy, e implica que cualquier tercero puede usarlos y adaptarlos. Y desde hace poco **ya no se pueden descargar** en ese plan.

**TripoSR.** El código es MIT, pero la licencia del código y la de los **pesos del modelo** son cosas distintas. Antes de uso comercial, lee la licencia de los pesos en Hugging Face y guarda copia en PDF de la versión vigente el día que la adoptes.

**Regla general:** la licencia de salida vale tanto como la licencia de entrada. Si el restaurante sube una foto que no le pertenece, tu modelo 3D hereda el problema. Por eso la casilla de garantía de la Fase 4 no es un formalismo.

| Dependencia | Licencia | Obligación |
|---|---|---|
| `<model-viewer>` | Apache 2.0 | Incluir aviso de copyright y NOTICE |
| Next.js, React, Tailwind | MIT | Incluir texto de licencia |
| Supabase (cliente) | Apache 2.0 / MIT | Incluir avisos |
| gltf-transform | MIT | Incluir |
| usd_from_gltf / USD | Apache 2.0 modificada | Revisar el NOTICE de Pixar |

### 6.3 Documentos a producir

1. **Términos y Condiciones del servicio** — objeto, planes, pagos, vigencia, suspensión, limitación de responsabilidad, propiedad intelectual y **terminación con portabilidad**: qué pasa con sus modelos si se van. Sé generoso; permitirles descargarlos al terminar es argumento de venta, no pérdida.
2. **Contrato de licencia y contenido con el restaurante** — el que más te protege. Garantía de titularidad de las fotos; licencia no exclusiva a tu favor para procesar, generar, almacenar y desplegar; casilla separada y opcional para usarlas en tu portafolio; indemnidad si un tercero reclama; responsabilidad del restaurante sobre precios y disponibilidad; y titularidad de los modelos generados dicha explícitamente (recomendado: tú conservas los archivos, él tiene licencia de uso mientras esté suscrito y copia al terminar).
3. **Política de Tratamiento de Datos Personales (Ley 1581 de 2012)** — no depende de tu tamaño. El registro en el RNBD ante la SIC solo obliga a sociedades y ESAL con activos superiores a 100.000 UVT (unos COP $5.200 millones) y a personas jurídicas públicas, así que a ti no te aplica al principio; el resto de la ley sí: política vigente, aviso de privacidad, autorización del titular, procedimientos de consulta y reclamo, y medidas de seguridad.
4. **Aviso de privacidad y política de cookies** — versión corta y legible en el pie de ambas apps.
5. **DPA y subprocesadores** — Supabase, Vercel y el generador procesan por cuenta tuya y están fuera de Colombia. Acepta sus DPA, lista los subencargados en `/subprocesadores` y declara la transferencia internacional.

> **La mejor decisión legal es de diseño:** que el comensal no sea titular de datos. Sin login, sin correo, sin cookies de terceros, sin identificadores persistentes. Solo conteos agregados. Si nadie identificable pasa por el menú público, la Ley 1581 te aplica únicamente frente a los datos de los dueños de restaurante, que son cuatro campos. Y tu banner de cookies puede decir la verdad más cómoda del mercado: no usamos ninguna.

### 6.4 Estatuto del Consumidor (Ley 1480 de 2011) — el riesgo que nadie ve venir

Un modelo 3D de un plato **es publicidad**, y en Colombia la publicidad obliga al anunciante. Si el 3D muestra una porción mayor que la real, hay riesgo de publicidad engañosa para el restaurante y potencialmente para ti como plataforma.

Mitigaciones, todas ya incorporadas en las fases:

- Leyenda "Modelo referencial. La presentación puede variar." en el visor (Fase 3).
- Escala real obligatoria: `ar-scale="fixed"` más calibración del tamaño del plato en centímetros al generar (Fases 3 y 5).
- Precios con IVA e impuesto al consumo incluidos, con fecha de última actualización visible (Fase 2).
- Aprobación explícita del modelo por el restaurante, registrada en `audit_log` (Fases 4 y 5).
- Cláusula que traslada al restaurante la responsabilidad por la correspondencia entre modelo y plato servido (6.3).

### 6.5 Trámites ante autoridades

| Trámite | Entidad | ¿Cuándo? |
|---|---|---|
| Constitución de SAS | Cámara de Comercio | Antes del primer cliente que pague |
| Registro de soporte lógico | DNDA | Fase 0; barato y rápido |
| Registro de marca | SIC | Antes de invertir en pauta o material impreso |
| RNBD | SIC | Solo si superas 100.000 UVT en activos |

### 6.6 Puertas legales por etapa

**Antes de la demo:** licencia del generador verificada y archivada, leyenda referencial en el visor, auditoría de licencias en CI, registro de soporte lógico radicado.

**Antes del primer piloto, aunque sea gratis:** contrato de licencia y contenido firmado, política de tratamiento y aviso de privacidad publicados, flujo de aprobación de modelos funcionando con registro en `audit_log`.

**Antes de cobrar:** SAS constituida, T&C revisados por abogado, marca radicada, DPA aceptados y lista de subprocesadores publicada.

### Fuentes

- Meshy — Términos de uso: https://www.meshy.ai/terms-of-use
- Meshy — Propiedad de los modelos generados: https://help.meshy.ai/en/articles/10137554-what-is-the-ownership-of-the-generated-models
- Meshy — Alcance del plan gratuito, incluida la restricción de descarga: https://help.meshy.ai/en/articles/15696428-what-is-included-on-the-free-plan
- DNDA — Pronunciamientos sobre inteligencia artificial: https://www.derechodeautor.gov.co/es/pronunciamientos-sobre-ia
- SIC — Registro Nacional de Bases de Datos: https://www.sic.gov.co/registro-nacional-de-bases-de-datos

---

## 7. Orden de ataque sugerido

Fases 1 → 2 → 3 primero, con modelos puestos a mano. Eso te da una demo mostrable en pocos días y valida lo único que importa al principio: **que la experiencia se sienta mágica en la mesa**. Si eso no convence a un restaurante, el pipeline automático no lo va a salvar. Solo después construye las fases 4 → 5 → 6, que son las que convierten la demo en un producto.
