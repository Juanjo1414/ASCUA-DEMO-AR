/**
 * Servidor HTTP efímero que sirve un único archivo local en 127.0.0.1.
 *
 * Lo usa `build-asset.ts` (A-202) para poder pasarle una foto del disco a
 * `Generator.generate(photoUrl)` sin tocar esa interfaz, que espera una
 * URL pública — la misma forma en la que el worker real le entrega fotos
 * ya subidas a Supabase Storage. No sirve nada más que ese archivo, y se
 * cierra apenas `build-asset.ts` termina de usarlo.
 */
import { createServer, type Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { WorkerError } from '../errors.js';

const CONTENT_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

export interface LocalFileServer {
  /** URL local donde queda disponible el archivo mientras el servidor sigue abierto. */
  url: string;
  /** Cierra el servidor. Debe llamarse siempre, incluso si la generación falló. */
  close(): Promise<void>;
}

/**
 * Levanta el servidor y sirve `filePath` en su raíz.
 *
 * @param filePath - Ruta absoluta del archivo a servir (foto de entrada).
 * @returns La URL local y una función para cerrarlo.
 */
export async function serveLocalFile(filePath: string): Promise<LocalFileServer> {
  const contents = await readFile(filePath);
  const contentType = CONTENT_TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream';

  const server: Server = createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': contentType, 'Content-Length': contents.length });
    res.end(contents);
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new WorkerError('CLI_LOCAL_SERVER_NO_PORT', 'No se pudo determinar el puerto del servidor local.');
  }

  return {
    url: `http://127.0.0.1:${address.port}/`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
