# ADR-0001: ARFOODS como Estudio 3D ahora y plataforma SaaS después de validar

**Estado:** Aceptado · **Fecha:** 2026-10-05 · **Decide:** Juan José Jaramillo Mora

## Contexto
ARFOODS es una plataforma completa (Next.js + Supabase + worker 3D) con 103 pruebas y RLS bien aplicado, pero su pipeline 3D en servidor no se ha probado de punta a punta con un plato real, el generador gratuito es impredecible y desplegarla en planes gratuitos implica pausas (Supabase) y restricciones comerciales (Vercel Hobby). La prioridad de negocio es validar la demo con restaurantes.

## Decisión
1. **Ahora:** reutilizar el pipeline del worker como **CLI local** (`build-asset`) que produce modelos aprobados para la demo estática de `ASCUA-DEMO-PAGINA`, sin Supabase.
2. **Después de validar** (≥ 1 restaurante dispuesto a pagar): re-arquitectura modular por capas, Supabase `dev`/`prod`, decisión de hosting de producción (nuevo ADR).
3. Mientras tanto: sanear CI, lint, documentación y seguridad para que la base esté lista.

## Opciones consideradas
| Opción | Complejidad | Costo | Riesgo |
|---|---|---|---|
| A. Estudio 3D ahora, plataforma después (elegida) | Media | $0 | Bajo |
| B. Desplegar la plataforma completa ya | Alta | $0 con límites | Alto (pausas, pipeline no probado) |
| C. Abandonar ARFOODS y generar modelos a mano | Baja | $0 | Medio (se pierde el pipeline de optimización y USDZ) |

## Consecuencias
- ✅ Se aprovecha código probado (normalize-scale, optimize, usdz, poster).
- ✅ La interfaz `Generator` permite cambiar de generador sin tocar el pipeline.
- ⚠️ El panel del restaurante y el autoservicio no se muestran en vivo durante la validación.
- 🔁 Tareas A-301 … A-309 al iniciar la fase 8.
