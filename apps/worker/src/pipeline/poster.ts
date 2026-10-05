import puppeteer from 'puppeteer';
import { WorkerError } from '../errors.js';

const VIEWER_HTML = (modelDataUri: string) => `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <script type="module" src="https://unpkg.com/@google/model-viewer/dist/model-viewer.min.js"></script>
    <style>
      html, body { margin: 0; background: transparent; }
      model-viewer { width: 512px; height: 512px; }
    </style>
  </head>
  <body>
    <model-viewer
      src="${modelDataUri}"
      camera-controls="false"
      auto-rotate="false"
      shadow-intensity="1"
      exposure="1"
    ></model-viewer>
  </body>
</html>`;

// No estaba en el árbol de archivos original de la sección 1 del plan
// (solo nombraba optimize.ts, usdz.ts y upload.ts), pero el flujo del
// worker sí pide el paso "render de poster.webp (headless con three.js o
// screenshot de model-viewer)" — uso la segunda opción: es el mismo
// motor que ve el comensal, así que lo que se ve en el poster es
// exactamente lo que se ve al tocar "Ver en 3D / AR".
export async function renderPoster(glb: Buffer): Promise<Buffer> {
  try {
    // --no-sandbox: el worker corre como root dentro del contenedor
    // Docker (no hay usuario sin privilegios definido en el Dockerfile),
    // y Chromium se niega a arrancar como root sin esto.
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 512, height: 512 });

      const modelDataUri = `data:model/gltf-binary;base64,${glb.toString('base64')}`;
      await page.setContent(VIEWER_HTML(modelDataUri));

      await page
        .waitForFunction(
          () => {
            const viewer = document.querySelector('model-viewer') as unknown as
              | { modelIsVisible?: boolean }
              | null;
            return Boolean(viewer?.modelIsVisible);
          },
          { timeout: 30000 }
        )
        .catch(() => {
          // Si el modelo tarda más de 30 s en cargar, se toma la captura
          // igual — mejor un poster imperfecto que un job colgado.
        });

      const screenshot = await page.screenshot({ type: 'webp' });
      return Buffer.from(screenshot);
    } finally {
      await browser.close();
    }
  } catch (cause) {
    if (cause instanceof WorkerError) throw cause;
    throw new WorkerError(
      'PIPELINE_POSTER_RENDER_FAILED',
      `No se pudo renderizar el poster: ${cause instanceof Error ? cause.message : String(cause)}`,
      { cause }
    );
  }
}
