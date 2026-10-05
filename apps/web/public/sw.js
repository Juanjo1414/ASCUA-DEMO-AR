// Service worker del panel. Deliberadamente conservador: el panel muestra
// precios y disponibilidad que el dueño acaba de cambiar, así que servir una
// versión vieja desde caché sería peor que no tener caché.
//
// - Documentos y datos: red primero. Sin conexión, se muestra la página de
//   respaldo en vez del dinosaurio del navegador.
// - Estáticos con hash en el nombre (/_next/static): caché primero, porque el
//   nombre cambia en cada build y nunca sirven contenido obsoleto.
const VERSION = 'v1';
const SHELL_CACHE = `ascua-shell-${VERSION}`;
const STATIC_CACHE = `ascua-static-${VERSION}`;
const OFFLINE_URL = '/offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll([OFFLINE_URL])).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== SHELL_CACHE && key !== STATIC_CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Assets con hash inmutable: caché primero.
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ??
          fetch(request).then((response) => {
            const copy = response.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
            return response;
          })
      )
    );
    return;
  }

  // Navegación: red primero, respaldo offline sólo si la red falla.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match(OFFLINE_URL).then((hit) => hit ?? Response.error()))
    );
  }
});
