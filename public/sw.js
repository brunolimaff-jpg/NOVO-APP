// Service Worker para PWA
const CACHE_NAME = 'scout360-v1';
const STATIC_ASSETS = ['/', '/manifest.json'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS);
    }),
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(cacheNames.filter(name => name !== CACHE_NAME).map(name => caches.delete(name)));
    }),
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  // Network-first strategy para API calls
  if (event.request.url.includes('/api/')) {
    event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
    return;
  }

  // Cache-first strategy para assets estáticos
  event.respondWith(
    caches.match(event.request).then(response => {
      return (
        response ||
        fetch(event.request).then(fetchResponse => {
          return caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, fetchResponse.clone());
            return fetchResponse;
          });
        })
      );
    }),
  );
});
