// Service worker mínimo: permite instalar la app. No guarda caché, así cada
// actualización en GitHub se ve al volver a abrirla.
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', function () {});
