
const CACHE_NAME = 'uniteam-cache-v4';
const urlsToCache = [
  './index.html',
  './manifest.json',
  './icon.png'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
  
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

self.addEventListener('fetch', (event) => {
  // Navigation strategy: Network -> Cache
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .catch(() => {
          return caches.match('./index.html', { ignoreSearch: true });
        })
    );
    return;
  }

  // Dynamic caching for Code, Scripts (esm.sh) and Assets
  // This allows the app to function offline even if we didn't pre-cache everything.
  if (
      event.request.url.includes('esm.sh') || 
      event.request.url.endsWith('.tsx') || 
      event.request.url.endsWith('.ts') ||
      event.request.url.endsWith('.js') ||
      event.request.url.endsWith('.css')
  ) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        const fetchPromise = fetch(event.request).then((networkResponse) => {
          // Update cache with new version if network succeeds
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return networkResponse;
        });
        // Return cached response if available, otherwise fetch
        return cachedResponse || fetchPromise;
      })
    );
    return;
  }

  // Default strategy for other resources: Cache First, then Network
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        if (response) {
          return response;
        }
        return fetch(event.request);
      })
  );
});
