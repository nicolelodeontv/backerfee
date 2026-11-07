/* Offline support. Network-first so a new deploy is always picked up (and the
 * in-app update notifier keeps working); the cache is only a fallback. */
const CACHE = 'backerfee-v1';
const SHELL = [
  '/', '/index.html', '/style.css', '/script.js', '/calculator-utils.js',
  '/ui-enhancements.js', '/value-hints.js', '/update-notifier.js', '/pwa.js',
  '/fonts/fonts.css', '/fonts/poppins-400.woff', '/fonts/poppins-500.woff',
  '/fonts/poppins-600.woff', '/fonts/poppins-700.woff',
  '/mascots/afro-directions.webp', '/mascots/afro-reactions.webp',
  '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok && response.type === 'basic') {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request, { ignoreSearch: true }).then((hit) => hit || caches.match('/index.html')))
  );
});
