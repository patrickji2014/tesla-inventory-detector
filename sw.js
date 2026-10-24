/**
 * Tesla Inventory Watcher - Service Worker
 * Offline precaching & Web Push Notification support for iOS PWA
 */

const CACHE_NAME = 'tesla-watch-cache-v1';
const PRECACHE_ASSETS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'lib/tesla_api.js',
  'lib/storage.js',
  'lib/notifications.js',
  'lib/scanner.js'
];

// Install: Precache core static shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// Activate: Prune legacy caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Network-first with cache fallback
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Always bypass cache for inventory snapshot and external APIs
  if (
    url.pathname.includes('/data/') ||
    url.pathname.includes('/inventory') ||
    url.hostname.includes('tesla.com') ||
    url.hostname.includes('ntfy.sh')
  ) {
    return;
  }

  event.respondWith(
    fetch(req)
      .then((networkRes) => {
        if (networkRes && networkRes.status === 200) {
          const resClone = networkRes.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(req, resClone);
          });
        }
        return networkRes;
      })
      .catch(() => {
        return caches.match(req).then((cached) => {
          if (cached) return cached;
          if (req.mode === 'navigate') {
            return caches.match('index.html');
          }
          return new Response('Offline', { status: 503, statusText: 'Offline' });
        });
      })
  );
});

// Push notification event (iOS 16.4+ Web Push)
self.addEventListener('push', (event) => {
  let data = { title: '🚗 New Tesla Model Y Found!', body: 'A new vehicle is available.' };
  if (event.data) {
    try {
      data = event.data.json();
    } catch (_) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: './manifest.webmanifest',
    badge: './manifest.webmanifest',
    tag: 'tesla-inventory-alert',
    renotify: true,
    data: {
      url: data.url || './index.html'
    }
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'Tesla Inventory Alert', options)
  );
});

// Notification click event: focus or open URL
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const urlToOpen = (event.notification.data && event.notification.data.url) || './index.html';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (let client of windowClients) {
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});
