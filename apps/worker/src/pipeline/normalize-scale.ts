import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { getBounds, textureCompress } from '@gltf-transform/functions';
import { WorkerError } from '../errors.js';

// InstantMesh (y en general los modelos de imagen-a-3D de una sola
// foto) no tienen ninguna noción de tamaño real: normalizan la malla a
// una caja arbitraria, así que un plato puede salir mucho más grande
// que una persona si no se corrige. Sin un dato de calibración real por
// plato (pendiente — sección "Fases 3 y 5" del plan), se fuerza un
// tamaño físico razonable para un plato de comida servido, y se planta
// la base en Y=0 para que el AR lo apoye sobre la mesa en vez de
// dejarlo flotando.
const TARGET_SIZE_METERS = 0.28;

export async function normalizeScale(glb: Buffer): Promise<Buffer> {
  try {
    const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
    const document = await io.readBinary(glb);

    // Fuerza jpeg sin importar el formato original: usd_from_gltf (el
    // paso de .usdz) es de 2020 y no reconoce EXT_texture_webp/avif —
    // "auto" en el optimize del CLI no alcanza porque preserva el
    // formato de origen, y algunos modelos (los que no vienen de
    // InstantMesh, como uno subido a mano) ya traen texturas en webp.
    await document.transform(textureCompress({ targetFormat: 'jpeg' }));

    const scene = document.getRoot().listScenes()[0];

    const { min, max } = getBounds(scene);
    const [minX, minY, minZ] = min;
    const [maxX, maxY, maxZ] = max;
    const maxDim = Math.max(maxX - minX, maxY - minY, maxZ - minZ);

    if (maxDim <= 0) {
      throw new WorkerError('PIPELINE_NORMALIZE_SCALE_EMPTY_BOUNDS', 'El modelo no tiene geometría con la que calcular su tamaño.');
    }

    const scale = TARGET_SIZE_METERS / maxDim;
    const centerX = (minX + maxX) / 2;
    const centerZ = (minZ + maxZ) / 2;

    const wrapper = document.createNode('normalize-wrapper');
    for (const child of scene.listChildren()) {
      wrapper.addChild(child);
    }
    scene.addChild(wrapper);
    wrapper.setScale([scale, scale, scale]);
    wrapper.setTranslation([-centerX * scale, -minY * scale, -centerZ * scale]);

    return Buffer.from(await io.writeBinary(document));
  } catch (cause) {
    if (cause instanceof WorkerError) throw cause;
    throw new WorkerError(
      'PIPELINE_NORMALIZE_SCALE_FAILED',
      `No se pudo normalizar la escala del modelo: ${cause instanceof Error ? cause.message : String(cause)}`,
      { cause }
    );
  }
}
