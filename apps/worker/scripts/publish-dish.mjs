// Publica a mano un plato en 3D/AR a partir de un .glb ya generado
// (TRELLIS, Meshy, lo que sea) y la foto del plato.
//
// Hace lo mismo que el worker pero sin cola de jobs: simplifica la malla,
// saca el .usdz para iPhone, arma el poster, sube los tres al bucket
// `dish-assets` con la convención de pipeline/upload.ts, y deja la fila
// de `dish_assets` activa apuntando a ellos.
//
// Uso:
//   node scripts/publish-dish.mjs --glb plato.glb --photo plato.jpg --name "Filete a la parrilla"
//   node scripts/publish-dish.mjs --glb plato.glb --photo plato.jpg --dish-id <uuid>
//
// --name busca el plato por nombre en `dishes` y lo crea si no existe.
// --dish-id apunta a uno que ya existe. Sin ninguno de los dos, genera un
// id suelto y solo sube al storage (sirve si el plato únicamente vive en
// la landing).

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createHash, randomUUID } from 'node:crypto'
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { getBounds, textureCompress } from '@gltf-transform/functions'

const execFileAsync = promisify(execFile)

const BUCKET = 'dish-assets'
// Mismos valores que pipeline/optimize.ts. --simplify-error es lo que
// hace que el ratio se respete de verdad; ver el comentario de ese archivo.
const SIMPLIFY_RATIO = '0.15'
const SIMPLIFY_ERROR = '0.01'
// 4 MB en vez de 3: bajar el ratio de simplificación para ganar 120 KB se
// come detalle visible de la malla, y a 3-4 MB el modelo sigue abriendo
// rápido en móvil. El tope existe para atajar mallas desbocadas, no para
// pelear por decimales.
const MAX_GLB_MB = 4

function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]?.replace(/^--/, '')
    if (key) args[key] = argv[i + 1]
  }
  return args
}

function hashName(buffer, extension) {
  return `${createHash('sha256').update(buffer).digest('hex').slice(0, 16)}.${extension}`
}

async function simplifyGlb(inputPath, outputPath) {
  // Se invoca el cli.js con node en vez del shim de node_modules/.bin:
  // en Windows ese shim es un script de shell sin extensión que
  // `execFile` no sabe lanzar (ENOENT), y el .CMD de al lado exigiría
  // shell:true. Por el JS directo funciona igual en Windows y en Linux.
  const cli = resolve(import.meta.dirname, '../node_modules/@gltf-transform/cli/bin/cli.js')
  await execFileAsync(process.execPath, [
    cli,
    'simplify',
    inputPath,
    outputPath,
    '--ratio',
    SIMPLIFY_RATIO,
    '--error',
    SIMPLIFY_ERROR,
  ])
}

// Los modelos de Meshy y TRELLIS traen texturas WebP con la extensión
// EXT_texture_webp. usd_from_gltf es de 2020: sólo entiende JPEG/PNG/BMP/GIF
// y aborta antes de mirar la malla. Se reescribe una copia con las imágenes
// en JPEG sólo para ese paso; el .glb que sirve la web conserva sus WebP.
async function bakeTexturesToJpeg(inputPath, outputPath) {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  const document = await io.read(inputPath)

  let converted = 0
  for (const texture of document.getRoot().listTextures()) {
    if (texture.getMimeType() !== 'image/webp') continue
    const image = texture.getImage()
    if (!image) continue
    texture.setImage(await sharp(Buffer.from(image)).jpeg({ quality: 92 }).toBuffer())
    texture.setMimeType('image/jpeg')
    const uri = texture.getURI()
    if (uri) texture.setURI(uri.replace(/.webp$/i, '.jpg'))
    converted += 1
  }

  // Si la extensión sigue declarada en extensionsRequired, usd_from_gltf
  // falla aunque ya no queden imágenes WebP.
  for (const extension of document.getRoot().listExtensionsUsed()) {
    if (extension.extensionName === 'EXT_texture_webp') extension.dispose()
  }

  await io.write(outputPath, document)
  return converted
}

// Mismo criterio que pipeline/normalize-scale.ts del worker, que este script
// se estaba saltando: los modelos de imagen-a-3D no tienen ninguna nocion de
// tamano real y normalizan la malla a una caja arbitraria, asi que un plato
// puede salir del tamano de una mesa. Se fuerza un tamano fisico razonable y
// se planta la base en Y=0 para que el AR lo apoye sobre la mesa en vez de
// dejarlo flotando o incrustado.
const TARGET_SIZE_METERS = 0.28

async function normalizeGlbScale(inputPath, outputPath) {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  const document = await io.read(inputPath)

  // A jpeg de una vez: usd_from_gltf no entiende EXT_texture_webp y aborta.
  await document.transform(textureCompress({ targetFormat: 'jpeg' }))

  const scene = document.getRoot().listScenes()[0]
  const { min, max } = getBounds(scene)
  const [minX, minY, minZ] = min
  const [maxX, maxY, maxZ] = max
  const maxDim = Math.max(maxX - minX, maxY - minY, maxZ - minZ)
  if (maxDim <= 0) throw new Error('El modelo no tiene geometria con la que calcular su tamano.')

  const scale = TARGET_SIZE_METERS / maxDim
  const centerX = (minX + maxX) / 2
  const centerZ = (minZ + maxZ) / 2

  const wrapper = document.createNode('normalize-wrapper')
  for (const child of scene.listChildren()) wrapper.addChild(child)
  scene.addChild(wrapper)
  wrapper.setScale([scale, scale, scale])
  wrapper.setTranslation([-centerX * scale, -minY * scale, -centerZ * scale])

  await io.write(outputPath, document)
  return { maxDim, scale }
}

// usd_from_gltf vive en una imagen de Docker (el Dockerfile del worker lo
// trae, pero para uso manual la imagen pública es más rápida). Monta un
// directorio con el .glb y saca el .usdz al lado.
async function convertToUsdz(workDir, glbName, usdzName) {
  await execFileAsync(
    'docker',
    ['run', '--rm', '-v', `${workDir}:/usr/app/`, 'marlon360/usd-from-gltf:latest', glbName, usdzName],
    { env: { ...process.env, MSYS_NO_PATHCONV: '1' } }
  )
}

// Busca el plato por nombre y lo crea si no está. Devuelve null cuando no
// se pidió nombre: ahí el plato no se toca en la base y solo se sube al
// storage.
async function resolveDishId(supabase, name) {
  const { data: existing, error: findError } = await supabase
    .from('dishes')
    .select('id, name')
    .eq('name', name)
    .maybeSingle()

  if (findError) throw new Error(`No se pudo buscar el plato: ${findError.message}`)
  if (existing) {
    console.log(`  plato    "${existing.name}" ya existía (${existing.id})`)
    return existing.id
  }

  // Un plato nuevo necesita restaurante y categoría; se toma el primer
  // restaurante publicado y su última categoría, que es donde caen los
  // platos fuertes en el seed.
  const { data: restaurant } = await supabase
    .from('restaurants')
    .select('id')
    .eq('is_published', true)
    .limit(1)
    .single()

  if (!restaurant) throw new Error('No hay ningún restaurante publicado donde crear el plato.')

  const { data: category } = await supabase
    .from('categories')
    .select('id')
    .eq('restaurant_id', restaurant.id)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data: created, error: createError } = await supabase
    .from('dishes')
    .insert({
      restaurant_id: restaurant.id,
      category_id: category?.id ?? null,
      name,
      is_available: true,
    })
    .select('id')
    .single()

  if (createError) throw new Error(`No se pudo crear el plato: ${createError.message}`)
  console.log(`  plato    "${name}" creado (${created.id})`)
  return created.id
}

// Deja una sola fila activa por plato: la nueva entra con is_active=true y
// las anteriores se desactivan, igual que el "Aprobar y publicar" del panel.
async function upsertDishAsset(supabase, dishId, urls, bytesGlb) {
  const { error: deactivateError } = await supabase
    .from('dish_assets')
    .update({ is_active: false })
    .eq('dish_id', dishId)

  if (deactivateError) throw new Error(`No se pudieron desactivar los assets viejos: ${deactivateError.message}`)

  const { error } = await supabase.from('dish_assets').insert({
    dish_id: dishId,
    glb_url: urls.glb,
    usdz_url: urls.usdz ?? null,
    poster_url: urls.poster,
    bytes_glb: bytesGlb,
    generator: 'manual',
    is_active: true,
  })

  if (error) throw new Error(`No se pudo registrar el asset: ${error.message}`)
}

async function main() {
  const args = parseArgs(process.argv.slice(2))

  if (!args.glb || !args.photo) {
    console.error(
      'Uso: node scripts/publish-dish.mjs --glb <archivo.glb> --photo <foto.jpg> [--name "Nombre"] [--dish-id <uuid>]'
    )
    process.exit(1)
  }

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceRoleKey) {
    console.error('Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en el entorno.')
    process.exit(1)
  }

  const supabase = createClient(url, serviceRoleKey, { auth: { persistSession: false } })

  // Con --name el plato queda registrado en la base; sin él solo se suben
  // los archivos y el id es un identificador suelto para la landing.
  const registerInDb = Boolean(args.name || args['dish-id'])
  const dishId = args['dish-id'] ?? (args.name ? await resolveDishId(supabase, args.name) : randomUUID())

  const workDir = join(tmpdir(), `publish-dish-${randomUUID()}`)
  await mkdir(workDir, { recursive: true })

  try {
    console.log(`Plato: ${dishId}`)

    const rawBytes = (await readFile(resolve(args.glb))).byteLength
    const simplifiedPath = join(workDir, 'model.glb')
    await simplifyGlb(resolve(args.glb), simplifiedPath)

    // Sin este paso el plato sale del tamano arbitrario que le dio el
    // generador, que en AR puede ocupar la mesa entera.
    const { maxDim, scale } = await normalizeGlbScale(simplifiedPath, simplifiedPath)
    console.log(
      `  escala   ${maxDim.toFixed(2)} u -> ${TARGET_SIZE_METERS} m (factor ${scale.toFixed(4)})`
    )

    const glb = await readFile(simplifiedPath)
    console.log(
      `  malla    ${(rawBytes / 1048576).toFixed(2)} MB -> ${(glb.byteLength / 1048576).toFixed(2)} MB`
    )

    if (glb.byteLength / 1048576 > MAX_GLB_MB) {
      console.error(
        `\n  El .glb quedó en ${(glb.byteLength / 1048576).toFixed(2)} MB, por encima del tope de ${MAX_GLB_MB} MB.`
      )
      console.error(`  Baja SIMPLIFY_RATIO (${SIMPLIFY_RATIO} -> 0.08) en este script y vuelve a correrlo.`)
      process.exit(1)
    }

    // Sin .usdz el modelo igual sirve en Android (WebXR / Scene Viewer);
    // solo se pierde Quick Look en iPhone. No vale abortar por esto.
    let usdz = null
    try {
      await convertToUsdz(workDir, 'model.glb', 'model.usdz')
      usdz = await readFile(join(workDir, 'model.usdz'))
      console.log(`  usdz     ${(usdz.byteLength / 1048576).toFixed(2)} MB`)
    } catch (error) {
      console.warn(`  usdz     omitido (${error.message.split('\n')[0]}) — AR seguirá andando en Android`)
    }

    // La foto original como poster: es lo que se ve mientras carga el
    // modelo, y se ve mejor que un render de la malla simplificada.
    const poster = await sharp(await readFile(resolve(args.photo)))
      .resize(1024, 1024, { fit: 'cover' })
      .webp({ quality: 82 })
      .toBuffer()
    console.log(`  poster   ${(poster.byteLength / 1024).toFixed(0)} KB`)

    const items = [
      { key: 'glb', buffer: glb, name: hashName(glb, 'glb'), contentType: 'model/gltf-binary' },
      { key: 'poster', buffer: poster, name: hashName(poster, 'webp'), contentType: 'image/webp' },
    ]
    if (usdz) {
      items.push({ key: 'usdz', buffer: usdz, name: hashName(usdz, 'usdz'), contentType: 'model/vnd.usdz+zip' })
    }

    const urls = {}
    for (const { key, buffer, name, contentType } of items) {
      const path = `${dishId}/${name}`
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(path, buffer, { contentType, cacheControl: '31536000', upsert: false })

      // El nombre del archivo es el hash de su contenido, asi que un objeto
      // que ya existe con ese nombre es byte a byte el mismo: republicar un
      // plato reusando la misma foto no es un error, es el archivo intacto.
      if (error && !/already exists/i.test(error.message)) {
        console.error(`Falló la subida de ${key}: ${error.message}`)
        process.exit(1)
      }
      if (error) console.log(`  ${key.padEnd(8)} ya estaba en el bucket (contenido identico)`)

      urls[key] = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
    }

    if (registerInDb) {
      await upsertDishAsset(supabase, dishId, urls, glb.byteLength)
      console.log('  base     dish_assets actualizado (is_active=true)')
    } else {
      console.log('  base     omitida (sin --name ni --dish-id): solo storage')
    }

    console.log('\nListo. Para la landing:\n')
    console.log(`  '${dishId}': {`)
    console.log(`    glbUrl: \`\${ASSET_BASE}/${dishId}/${items.find((i) => i.key === 'glb').name}\`,`)
    console.log(
      usdz
        ? `    usdzUrl: \`\${ASSET_BASE}/${dishId}/${items.find((i) => i.key === 'usdz').name}\`,`
        : `    usdzUrl: null,`
    )
    console.log(`    posterUrl: \`\${ASSET_BASE}/${dishId}/${items.find((i) => i.key === 'poster').name}\`,`)
    console.log(`  },`)
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {})
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
