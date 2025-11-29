/**
 * Service Worker - Production Ready
 * 
 * Features:
 * - Cache versioning for automatic invalidation on deploy
 * - Stale-while-revalidate for optimal performance
 * - Offline fallback
 * - Skip waiting on user approval
 * - Proper lifecycle management
 */

const CACHE_VERSION = 'v1';
const CACHE_NAME = `kisanshakti-${CACHE_VERSION}-${Date.now()}`;
const RUNTIME_CACHE = `runtime-${CACHE_VERSION}`;
const API_CACHE = `api-${CACHE_VERSION}`;

// Assets to precache (critical for offline)
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192x192.png',
  '/icon-512x512.png'
];

// Cache-first patterns (static assets)
const CACHE_FIRST_PATTERNS = [
  /\.(?:png|jpg|jpeg|svg|gif|webp|ico)$/,
  /\.(?:woff|woff2|ttf|eot)$/,
  /\.(?:js|css)$/
];

// Network-first patterns (API calls, dynamic content)
const NETWORK_FIRST_PATTERNS = [
  /\/api\//,
  /supabase\.co/,
  /functions\.supabase\.co/
];

// ============== INSTALL EVENT ==============
self.addEventListener('install', (event) => {
  console.log('[SW] Installing version:', CACHE_NAME);
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Precaching assets');
        return cache.addAll(PRECACHE_ASSETS);
      })
      .then(() => {
        console.log('[SW] Precache complete');
        // Don't call self.skipWaiting() here - wait for user approval
      })
      .catch((error) => {
        console.error('[SW] Precache failed:', error);
      })
  );
});

// ============== ACTIVATE EVENT ==============
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating version:', CACHE_NAME);
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        // Delete old caches
        return Promise.all(
          cacheNames
            .filter((cacheName) => {
              return cacheName.startsWith('kisanshakti-') && cacheName !== CACHE_NAME;
            })
            .map((cacheName) => {
              console.log('[SW] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            })
        );
      })
      .then(() => {
        console.log('[SW] Old caches deleted, claiming clients');
        return self.clients.claim();
      })
      .then(() => {
        // Notify all clients that SW is activated
        return self.clients.matchAll().then((clients) => {
          clients.forEach((client) => {
            client.postMessage({ type: 'SW_ACTIVATED', version: CACHE_VERSION });
          });
        });
      })
  );
});

// ============== FETCH EVENT ==============
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip chrome-extension and non-http requests
  if (!url.protocol.startsWith('http')) {
    return;
  }

  // Check if should use cache-first strategy
  const isCacheFirst = CACHE_FIRST_PATTERNS.some((pattern) => pattern.test(url.pathname));
  
  // Check if should use network-first strategy
  const isNetworkFirst = NETWORK_FIRST_PATTERNS.some((pattern) => pattern.test(url.href));

  if (isCacheFirst) {
    // Cache-first strategy for static assets
    event.respondWith(cacheFirst(request));
  } else if (isNetworkFirst) {
    // Network-first strategy for API calls
    event.respondWith(networkFirst(request));
  } else {
    // Stale-while-revalidate for everything else
    event.respondWith(staleWhileRevalidate(request));
  }
});

// ============== CACHING STRATEGIES ==============

/**
 * Cache-first: Serve from cache, fallback to network
 * Best for: Static assets (images, fonts, CSS, JS)
 */
async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  
  if (cached) {
    console.log('[SW] Cache hit:', request.url);
    return cached;
  }

  console.log('[SW] Cache miss, fetching:', request.url);
  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    console.error('[SW] Fetch failed:', request.url, error);
    return new Response('Network error', { status: 408, statusText: 'Network error' });
  }
}

/**
 * Network-first: Try network, fallback to cache
 * Best for: API calls, dynamic content
 */
async function networkFirst(request) {
  const cache = await caches.open(API_CACHE);
  
  try {
    const response = await fetch(request, { timeout: 5000 });
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    console.log('[SW] Network failed, trying cache:', request.url);
    const cached = await cache.match(request);
    if (cached) {
      return cached;
    }
    throw error;
  }
}

/**
 * Stale-while-revalidate: Serve cache, update in background
 * Best for: Most pages, balance of speed and freshness
 */
async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);

  // Return cached immediately if available
  const fetchPromise = fetch(request)
    .then((response) => {
      if (response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch((error) => {
      console.error('[SW] Fetch error:', error);
      // If network fails and we have cache, return it
      if (cached) {
        return cached;
      }
      throw error;
    });

  return cached || fetchPromise;
}

// ============== MESSAGE HANDLER ==============
self.addEventListener('message', (event) => {
  console.log('[SW] Received message:', event.data);

  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('[SW] User approved update, activating new version');
    self.skipWaiting();
  }

  if (event.data && event.data.type === 'CLEAR_CACHES') {
    console.log('[SW] Clearing all caches');
    event.waitUntil(
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => caches.delete(cacheName))
        );
      })
    );
  }

  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({ version: CACHE_VERSION, cacheName: CACHE_NAME });
  }
});

// ============== PUSH NOTIFICATIONS (optional) ==============
self.addEventListener('push', (event) => {
  if (!event.data) return;

  const data = event.data.json();
  console.log('[SW] Push notification received:', data);

  const options = {
    body: data.body || '',
    icon: '/icon-192x192.png',
    badge: '/icon-192x192.png',
    vibrate: [200, 100, 200],
    data: data.data || {},
    actions: data.actions || []
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'KisanShakti', options)
  );
});

self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event.notification.tag);
  event.notification.close();

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // If app is already open, focus it
        for (const client of clientList) {
          if (client.url === '/' && 'focus' in client) {
            return client.focus();
          }
        }
        // Otherwise open new window
        if (clients.openWindow) {
          return clients.openWindow('/');
        }
      })
  );
});

console.log('[SW] Service Worker loaded, version:', CACHE_VERSION);
