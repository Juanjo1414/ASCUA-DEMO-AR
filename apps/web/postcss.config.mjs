// Requerido por Tailwind v4 para engancharse al pipeline de PostCSS de Next.js.
// No estaba en el árbol original del esqueleto; se añade porque Tailwind
// no funciona sin él.
const config = {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};

export default config;
