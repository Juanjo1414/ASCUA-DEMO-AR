import path from 'node:path';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// .mts y no .ts: este paquete no declara "type": "module", así que un
// vitest.config.ts se carga como CommonJS y falla al importar
// @vitejs/plugin-react, que hoy sólo se publica como ESM. La extensión
// fuerza el modo correcto sin tocar el resto del paquete, que Next.js
// espera en CommonJS.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
  },
  resolve: {
    alias: {
      // import.meta.dirname en vez de __dirname, que no existe en ESM.
      '@': path.resolve(import.meta.dirname, '.'),
    },
  },
});
