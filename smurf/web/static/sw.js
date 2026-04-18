// SMURF service worker — minimal cache-first for static assets so the
// admin/softphone are usable offline once loaded.
const CACHE = 'smurf-v1';
const ASSETS = [
  '/', '/admin', '/softphone', '/login',
  '/static/style.css', '/static/admin.js', '/static/softphone.js', '/static/sip-ws.js',
  '/manifest.webmanifest',
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS).catch(()=>{})));
  self.skipWaiting();
});
self.addEventListener('activate', (e) => {
  e.waitUntil(self.clients.claim());
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.pathname.startsWith('/api/')) return; // never cache API
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request).then(resp => {
      if (resp && resp.status === 200 && resp.type === 'basic') {
        const clone = resp.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
      }
      return resp;
    }).catch(()=>r))
  );
});
