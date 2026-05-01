// Service Worker for offline-first app
// Caches app shell on first load, serves from cache when offline

const CACHE_VERSION = 'v1';
const CACHE_NAME = `vault-reader-${CACHE_VERSION}`;

// Install event - cache essential assets
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');
  
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Caching root page');
        return cache.add('/');
      })
      .then(() => self.skipWaiting())
      .catch((err) => {
        console.warn('[SW] Install error:', err);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');
  
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME)
            .map((name) => {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => self.clients.claim())
  );
});

// Fetch event - serve from cache if offline
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') {
    return;
  }

  // Skip API requests - let them fail offline
  if (url.pathname.startsWith('/api/') || url.hostname.includes('supabase')) {
    return;
  }

  // Network first, fallback to cache
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (!response || response.status !== 200 || response.type === 'error') {
          return response;
        }

        const responseToCache = response.clone();
        caches
          .open(CACHE_NAME)
          .then((cache) => {
            cache.put(request, responseToCache);
          });

        return response;
      })
      .catch(() => {
        // Network failed, try cache
        return caches
          .match(request)
          .then((cachedResponse) => {
            if (cachedResponse) {
              console.log('[SW] Serving from cache:', request.url);
              return cachedResponse;
            }

            // Navigation request? Serve root
            if (request.mode === 'navigate') {
              return caches.match('/');
            }

            return new Response('Offline - Asset not available', {
              status: 503,
            });
          });
      })
  );
});
