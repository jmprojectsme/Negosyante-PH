/* Negosyante PH service worker: works offline, updates when a new version is published.
   version.js holds the version; the page registers this worker with updateViaCache: 'none'. */
importScripts('version.js');
const CACHE = 'negosyante-' + APP_VERSION;
const FILES = ['./', 'index.html', 'style.css', 'version.js', 'data.js', 'engine.js', 'features.js', 'ui.js', 'app.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png', 'icons/favicon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('negosyante-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// the page asks the waiting worker to take over when the player taps "Update"
self.addEventListener('message', (e) => { if (e.data === 'skipWaiting') self.skipWaiting(); });
// network first for the page (so updates show), cache first for everything else
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put('index.html', copy)); return r; }).catch(() => caches.match('index.html')));
    return;
  }
  e.respondWith(caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).then((r) => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); } return r; })));
});
