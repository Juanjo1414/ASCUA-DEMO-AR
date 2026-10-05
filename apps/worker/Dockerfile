# Fase 5 — worker de generación 3D (foto → .glb optimizado + .usdz + poster).
#
# Se construye desde la RAÍZ del monorepo, no desde apps/worker/, porque
# el build context necesita ver pnpm-workspace.yaml y packages/db:
#   docker build -f apps/worker/Dockerfile -t menu-ar-worker .
#
# usd_from_gltf no se instala con pip (usd-core es otra cosa: bindings
# de Python de Pixar, no el binario de conversión de Google). No hay
# paquete oficial — se saca prebuilt de esta imagen de terceros
# (Debian buster, glibc compatible con bookworm) en vez de compilarlo
# desde código (requiere Bazel + USD completo, mucho más pesado).
#
# CN-007: digest fijo en vez de `:latest`. Una tag flotante puede apuntar a
# contenido distinto sin aviso (acción del mantenedor o compromiso de
# cuenta), y estos binarios se copian tal cual dentro de la imagen final.
# Resuelto el 2026-08-28 desde Docker Hub (`docker manifest inspect
# marlon360/usd-from-gltf:latest`); si hace falta actualizar, resolver de
# nuevo el digest de la tag y reemplazarlo acá.
FROM marlon360/usd-from-gltf@sha256:98905e9ee0df44100ca7cbc2d39972a131944b7b378fe750e248c3390101c082 AS usdtools

# CN-009: etapa de build separada. Acá viven devDependencies, el código
# TypeScript fuente y el store completo de pnpm — nada de esto debe llegar
# a la imagen final, solo el `dist/` compilado y un node_modules de producción.
FROM node:22-slim AS builder

# corepack, no npm install -g: la red de esta compu resetea conexiones
# largas/inestables a registry.npmjs.org de rato en rato; corepack viene
# con Node 22 y no depende de esa misma llamada de red.
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/db ./packages/db
COPY apps/worker ./apps/worker

WORKDIR /app/apps/worker
RUN pnpm install --frozen-lockfile
RUN pnpm run build
# Reinstala solo dependencias de producción sobre el mismo lockfile, ya
# compilado — así el node_modules que se copia a la imagen final no
# arrastra devDependencies (typescript, tsx, vitest, etc.).
RUN pnpm install --prod --frozen-lockfile

# Node para el worker, Chromium para el poster con Puppeteer —
# "USDZ sin necesitar una Mac" (sección 1 del plan).
# Node 22, no 20: @supabase/supabase-js exige WebSocket nativo (Node 22+).
FROM node:22-slim

# http://deb.debian.org (puerto 80) no responde en esta red; https sí,
# pero node:22-slim en realidad NO trae ca-certificates de fábrica
# (verificado: el comentario original de CN-008 asumía que sí, y en la
# práctica el primer apt-get fallaba con "No system certificates
# available"). En vez de volver a desactivar la verificación TLS
# (exactamente lo que CN-008 quería evitar, con razón — expone el build
# a que alguien inyecte un paquete `chromium` malicioso vía MITM), se
# copia un bundle de certificados real desde la etapa `usdtools`, que ya
# lo trae instalado — así el primer apt-get valida contra certificados
# de verdad, sin bypass.
COPY --from=usdtools /etc/ssl/certs /etc/ssl/certs
COPY --from=usdtools /usr/share/ca-certificates /usr/share/ca-certificates
COPY --from=usdtools /etc/ca-certificates.conf /etc/ca-certificates.conf

RUN sed -i 's|http://deb.debian.org|https://deb.debian.org|g' /etc/apt/sources.list.d/debian.sources \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
    chromium \
    ca-certificates \
    procps \
    && rm -rf /var/lib/apt/lists/*

COPY --from=usdtools /usr/src/app/USDinst /usr/src/app/USDinst
COPY --from=usdtools /usr/local/ufg /usr/local/ufg
COPY --from=usdtools /usr/local/lib/libpython2.7.so.1.0 /usr/local/lib/libpython2.7.so.1.0
ENV LD_LIBRARY_PATH=/usr/src/app/USDinst/lib:/usr/local/lib
ENV PATH="/usr/local/ufg/bin:${PATH}"
RUN ldconfig

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app/apps/worker
COPY --from=builder /app/apps/worker/dist ./dist
COPY --from=builder /app/apps/worker/node_modules ./node_modules
COPY --from=builder /app/apps/worker/package.json ./package.json

# CN-003: sin USER, el worker y el subproceso de Chromium (que procesa
# input influenciable por un atacante — fotos, modelos generados) corrían
# como root durante todo el ciclo de vida del contenedor, ampliando el
# radio de daño de cualquier escape de contenedor o dependencia
# comprometida. Puppeteer ya arranca con --no-sandbox/--disable-setuid-sandbox
# (ver pipeline/poster.ts) porque este contenedor no trae el binario setuid
# de Chromium ni capacidades extra — eso sigue igual corriendo como
# usuario sin privilegios; lo que cambia es que ya no es root.
RUN groupadd -r worker && useradd -r -g worker -d /app -s /usr/sbin/nologin worker \
    && chown -R worker:worker /app /usr/src/app/USDinst /usr/local/ufg
USER worker

# CN-020: no hay endpoint HTTP (es un loop de polling), así que el
# healthcheck solo confirma que el proceso Node del worker sigue vivo.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD pgrep -f "node .*dist/index.js" > /dev/null || exit 1

# `pnpm start`, no `node dist/index.js` directo: pnpm agrega
# node_modules/.bin al PATH del proceso, que es donde queda el binario
# de @gltf-transform/cli que usa optimize.ts vía execFile().
CMD ["pnpm", "start"]
