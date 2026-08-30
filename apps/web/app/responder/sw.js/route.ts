const SERVICE_WORKER = `
const CACHE = 'dispatch-responder-v1';
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.add('/responder')).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  event.respondWith(fetch(request).then((response) => {
    const copy = response.clone();
    caches.open(CACHE).then((cache) => cache.put(request, copy));
    return response;
  }).catch(() => caches.match(request).then((cached) => cached || caches.match('/responder'))));
});
// Tocar el aviso lleva al panel: si ya hay una pestaña abierta se enfoca esa,
// para no dejar dos paneles compitiendo por el mismo reporte.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
    const open = windows.find((client) => client.url.includes('/responder'));
    if (open) return open.focus();
    return clients.openWindow('/responder');
  }));
});
`;

export async function GET(): Promise<Response> {
  return new Response(SERVICE_WORKER, {
    headers: {
      'content-type': 'application/javascript; charset=utf-8',
      'cache-control': 'no-cache',
      'service-worker-allowed': '/responder/',
    },
  });
}
