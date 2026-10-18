# Estado del proyecto — ASCUA-DEMO-AR (ARFOODS)

> Documento vivo. Se actualiza al **cerrar cada sesión**, con Claude Code o Antigravity.

**Última actualización:** 2026-10-05 · **Por:** Claude (chat de planeación) · **Rama:** `dev/Juanjo`

## Fase actual
Fase 0 — Fundaciones / Fase A — Saneamiento.

## Tarea actual
X-001 — Crear rama `dev/Juanjo`. **Estado:** pendiente.

## Último paso completado
Plan, CLAUDE.md, AGENTS.md y nuevo CI redactados (aún no copiados al repo).

## Siguiente paso exacto
1. `git checkout main; git pull; git checkout -b dev/Juanjo; git push -u origin dev/Juanjo` (PowerShell).
2. X-002: copiar entregables; **no** reemplazar `ci.yml` todavía.
3. A-001: crear `apps/web/eslint.config.mjs` y dejar `pnpm -r lint` en verde.
4. A-002: reemplazar `ci.yml` por el nuevo y agregar `worker-image.yml`.

## Línea base verificada (2026-10-05)
- `pnpm install --frozen-lockfile` ⚠️ requiere `PUPPETEER_SKIP_DOWNLOAD=1` si no se puede descargar Chromium.
- Pruebas ✅ 103 (db 2 · worker 16 · web 85). `tsc --noEmit` ✅ web y worker.
- `pnpm --filter web lint` ❌ ESLint 9 sin `eslint.config.*` → el CI actual falla en lint.
- Seguridad: ya corregidos CN-001/002/003/005/007/009/010/014/016/018 del reporte 2026-08-28. Re-auditar en A-004.

## Bloqueos
- Ninguno.

## Pendientes detectados
- `normalize-scale.ts`/`publish-dish.mjs` fijan todos los platos a 16 cm → A-204 (medida real por plato).
- `PROJECT_CONTEXT.md` desactualizado (A-003).

## Comandos para verificar
```powershell
$env:PUPPETEER_SKIP_DOWNLOAD="1"; pnpm install --frozen-lockfile
pnpm -r test
pnpm verify      # disponible desde A-005
```
