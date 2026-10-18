# AGENTS.md — ASCUA-DEMO-AR

> Lo leen Antigravity y otros agentes compatibles con AGENTS.md.

## Regla principal

**Las reglas completas de este repositorio están en `CLAUDE.md`.** Antes de cualquier acción:

1. Lee `CLAUDE.md` completo y aplícalo como si estuviera escrito aquí. Todas sus reglas valen igual para ti.
2. Lee `docs/ESTADO.md` y retoma desde el "Siguiente paso exacto".
3. Ubica la tarea por su ID en `docs/PLAN-IMPLEMENTACION.md`.

## Diferencias para Antigravity

- **Skills de Claude Code** (`/security-review`, `cyber-neo`, `engineering:*`, `design:*`): si no existen en esta herramienta, sigue la columna "Si no está instalada" de la sección 7 de `CLAUDE.md`. Nunca omitas el paso.
- **graphify:** usa la CLI desde la terminal integrada (`graphify query "…"`, `graphify explain "…"`, `graphify path "A" "B"`) antes de buscar archivos a ciegas.
- **Artefactos de Antigravity** (planes, walkthroughs): lo importante debe quedar también en el repo (`docs/ESTADO.md`, `docs/sesiones/`, `docs/adr/`), porque Juan alterna con Claude Code.
- **Verificación:** `pnpm verify` debe pasar antes de cualquier commit que entregues como terminado.
- **Rama:** solo `dev/Juanjo`. Nunca `main`. Nunca push, PR ni merge sin que Juan lo pida.

## Cierre de sesión (obligatorio)

1. `pnpm verify` en verde (o commit `wip(<ID>)` que pase, con el faltante explicado).
2. Actualizar `docs/ESTADO.md`.
3. Bitácora en `docs/sesiones/AAAA-MM-DD-<tema>.md` (plantilla en `CLAUDE.md` §9), indicando "Herramienta: Antigravity".
