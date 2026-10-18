# Estado del proyecto — ASCUA-DEMO-AR (ARFOODS)

> Documento vivo. Se actualiza al **cerrar cada sesión**, con Claude Code o Antigravity.

**Última actualización:** 2026-10-18 · **Por:** Claude Code · **Rama:** `dev/Juanjo`

## Fase actual
Fase 5 — Estudio 3D (CLI local), tareas A-202/A-204, para destrabar R-8/P-601 del repo PAGINA.

## Tarea actual
A-202/A-204 — CLI `build-asset` con escala real por plato. **Estado:** CLI construido y probado; falta que Juan lo corra con su `HF_TOKEN` y Docker para generar los 5 modelos reales de la demo.

## Último paso completado
- `dev/Juanjo` creada (X-001), con el scaffold suelto (CLAUDE.md, docs/,
  CI nuevo, ADR-0001) como primer commit.
- `apps/worker/src/cli/build-asset.ts`: CLI que convierte una foto en
  `modelo.glb` + `modelo.usdz` + `poster.webp` + `manifest.json`, sin
  Supabase. Reutiliza `generators/index.ts`, `pipeline/optimize.ts`,
  `pipeline/normalize-scale.ts` (ahora con escala por parámetro, no fija
  a 0.28 m) y `pipeline/poster.ts`. Nuevo: `serve-local-file.ts` (sirve
  la foto local por HTTP efímero para no tocar la interfaz `Generator`)
  y `convert-usdz-docker.ts` + `Dockerfile.usdz` (imagen mínima solo
  para `usd_from_gltf`, en vez de la imagen completa del worker).
- Pruebas: `build-asset.test.ts`, 5 casos con los pasos del pipeline
  inyectados (sin red ni Docker reales). `pnpm --filter worker test`:
  21/21 en verde. `tsc --noEmit` y `pnpm --filter worker build` en verde.
- Script `pnpm asset:build` agregado a `apps/worker/package.json`.

## Siguiente paso exacto
1. **Tuyo, Juan:** `$env:HF_TOKEN = "hf_tu_token"` en PowerShell, confirmar
   Docker Desktop corriendo, construir la imagen una vez:
   `docker build -f apps/worker/Dockerfile.usdz -t menu-ar-usdz-tool .`
   (desde la raíz de este repo).
2. Correr `npx tsx scripts/tools/generar-modelos-demo.ts` desde la raíz
   del repo `MENU AR - PAGINA` — genera los 5 platos de la demo y conecta
   `restaurant.json` (sin aprobar ningún modelo).
3. QA física en tu iPhone y Android (`docs/runbooks/qa-dispositivos.md`
   del repo PAGINA) y aprobar a mano los que pasen.
4. Commitear y hacer push de este trabajo en ambos repos (hoy solo está
   en local, en `dev/Juanjo`; nadie ha pedido el push todavía).
5. A-001 (ESLint de `web` roto) sigue pendiente, sin relación con esta
   tarea — no se tocó.

## Línea base verificada (2026-10-18)
- `pnpm install --frozen-lockfile` ✅ (2m44s).
- `pnpm --filter worker test` ✅ 21/21 (16 preexistentes + 5 nuevas de `build-asset`).
- `pnpm --filter worker exec tsc --noEmit` ✅ 0 errores.
- `pnpm --filter worker build` ✅.
- `pnpm -r lint` ❌ solo por `apps/web` (A-001, deuda preexistente, no tocada esta sesión).
- Seguridad: ya corregidos CN-001/002/003/005/007/009/010/014/016/018 del reporte 2026-08-28. Re-auditar en A-004.

## Bloqueos
- Ninguno para el código (ver fix de `optimize.ts` más abajo). La
  generación de 3 de los 5 modelos de la demo (`vieiras`, `langosta`,
  `pato`) está bloqueada por la cuota diaria gratuita de GPU (ZeroGPU)
  de Hugging Face en la cuenta de Juan — no por un bug; el Space lo
  reporta explícitamente. `filete` y `tagliatelle` sí se generaron bien.
  Se resuelve solo esperando a que la cuota se renueve y reintentando
  `scripts/tools/generar-modelos-demo.ts` del repo PAGINA.

## Corregido al usarlo por primera vez en Windows (2026-10-18)
- `optimizeGlb` fallaba con `ENOENT` (shim `.cmd` de `gltf-transform` no
  resuelto sin shell) y luego con `MODULE_NOT_FOUND` (el mismo shim roto
  al invocarse anidado dentro de otra línea de comando). Corregido en
  `pipeline/optimize.ts`: invoca el archivo real del CLI con `node` en
  vez del shim. Verificado con una ejecución real end-to-end (no mocks).
  Esto era imposible de ver antes porque el worker real solo corre
  dentro de Docker/Linux, donde el binario nativo no tiene este problema.

## Pendientes detectados
- `PROJECT_CONTEXT.md` desactualizado (A-003).
- A-001 (ESLint de `web`) sigue roto.
- `Dockerfile.usdz` no tiene su propio job de CI (el `worker-image.yml` existente solo construye el `Dockerfile` completo); si se usa seguido, vale la pena agregarle verificación en CI más adelante — no bloquea el uso manual de hoy.

## Comandos para verificar
```powershell
$env:PUPPETEER_SKIP_DOWNLOAD="1"; pnpm install --frozen-lockfile
pnpm --filter worker test
pnpm --filter worker exec tsc --noEmit
pnpm --filter worker build
# pnpm verify (raíz) todavía no existe como script — A-005 pendiente;
# `pnpm -r lint` falla hoy solo por apps/web (A-001).
```
