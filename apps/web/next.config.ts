import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  images: {
    // Las fotos de los platos viven en Supabase Storage
    // (`<project-ref>.supabase.co/storage/v1/object/public/...`).
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
  // CN-014: sin esto Next.js manda `X-Powered-By: Next.js` en cada
  // respuesta — no es una vulnerabilidad en sí, pero le regala al
  // atacante una pista gratis de qué framework/versión está probando.
  poweredByHeader: false,
  // CN-010: no había ningún header de seguridad configurado. El panel
  // (`/admin`) queda autenticado por cookie de sesión — sin
  // X-Frame-Options, cualquier sitio podía embeberlo en un iframe y armar
  // un clickjacking contra las acciones del dueño sobre su propio
  // restaurante.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          // camera=(self), no camera=(): el visor de AR (WebXR además de
          // Scene Viewer/Quick Look) necesita cámara en el propio origen
          // para plantar el modelo en la mesa real — con camera=() vacío
          // el navegador le niega el permiso a WebXR igual que a
          // getUserMedia, y el botón "Ver en 3D / AR" queda mudo en
          // celulares que sí soportan WebXR. (self) sigue bloqueando que
          // un sitio ajeno use la cámara embebiéndote en un iframe, que
          // era la intención real de CN-010 — no se pierde esa protección.
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
