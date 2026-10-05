import type { MetadataRoute } from 'next';

// La PWA es sólo el panel del restaurante: start_url y scope apuntan a
// /admin para que al abrir el icono caiga directo en el menú, y para que la
// carta pública del comensal (/m/[slug]) quede fuera de la app instalada.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Ascua — Panel del restaurante',
    short_name: 'Ascua',
    description:
      'Administra la carta, los modelos 3D y el QR de tu restaurante desde el celular.',
    start_url: '/admin/menu',
    scope: '/admin',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0f0e0d',
    theme_color: '#0f0e0d',
    lang: 'es',
    categories: ['business', 'food'],
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      // maskable aparte: Android recorta el icono en círculo y sin esta
      // variante con margen se come los bordes de la llama.
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Mi carta', url: '/admin/menu' },
      { name: 'Mi QR', url: '/admin/qr' },
    ],
  };
}
