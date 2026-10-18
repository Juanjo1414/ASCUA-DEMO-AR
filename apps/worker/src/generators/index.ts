export interface Generator {
  name: string;
  generate(photoUrl: string): Promise<Buffer>; // glb crudo
}

import { instantmeshGenerator } from './instantmesh.js';
import { triposrGenerator } from './triposr.js';
import { meshyGenerator } from './meshy.js';

// Cambiar del generador gratis a Meshy Pro el día que haya un cliente
// pagando = una variable de entorno (sección 1 del plan).
// Default: InstantMesh, no TripoSR — el Space oficial de TripoSR está
// roto hoy (issue abierto "not working", sin mantenimiento de Stability
// AI). triposr.ts queda por si lo arreglan más adelante.
const GENERATORS: Record<string, Generator> = {
  instantmesh: instantmeshGenerator,
  triposr: triposrGenerator,
  meshy: meshyGenerator,
};

export const generator: Generator = GENERATORS[process.env.GENERATOR ?? 'instantmesh'] ?? instantmeshGenerator;

/**
 * Busca un generador por nombre. Lo usa el CLI `build-asset` (A-202),
 * que recibe el generador como argumento (`--generador`) en vez de la
 * variable de entorno `GENERATOR` que usa el worker en loop.
 *
 * @param name - Nombre del generador ('instantmesh', 'triposr', 'meshy').
 * Si falta o no existe, devuelve InstantMesh (el mismo default que `generator`).
 */
export function getGeneratorByName(name?: string): Generator {
  if (!name) return instantmeshGenerator;
  return GENERATORS[name] ?? instantmeshGenerator;
}
