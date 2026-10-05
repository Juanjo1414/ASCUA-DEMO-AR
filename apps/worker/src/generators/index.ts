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
