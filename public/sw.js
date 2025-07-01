// public/sw.js - Fixed version that handles chunk loading properly

const CACHE_NAME = 'bg-events-app-v1.5'; // Increment version number
const urlsToCache = [
  '/',
  '/login',
  '/manifest.json',
  '/icon-192x192.png',
  '/icon-512x512.png',
];

// Install: cache only essential assets
self.addEventListener('install', event => {
  console.log('[SW] Install v1.5');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        // Only cache critical assets, not JS chunks
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        console.log('[SW] Assets cached, skipping waiting');
        return self.skipWaiting();
      })
      .catch(err => {
        console.error('[SW] Cache failed:', err);
      })
  );
});

// Activate: clear old caches and take control
self.addEventListener('activate', event => {
  console.log('[SW] Activate v1.5');
  event.waitUntil(
    Promise.all([
      // Clear old caches
      caches.keys().then(names => 
        Promise.all(
          names.map(name => {
            if (name !== CACHE_NAME) {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
            }
          })
        )
      ),
      // Take control immediately
      self.clients.claim()
    ]).then(() => {
      console.log('[SW] Ready and in control');
    })
  );
});

// Fetch: Network-first for JS chunks, cache-first for static assets
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests and external URLs
  if (request.method !== 'GET' || !url.origin.includes(self.location.origin)) {
    return;
  }

  // Handle different types of requests
  if (url.pathname.includes('/_next/static/chunks/')) {
    // JS Chunks: Always try network first to avoid stale chunk issues
    event.respondWith(
      fetch(request)
        .then(response => {
          // If network succeeds, cache the new chunk
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          // If network fails, try cache as fallback
          console.log('[SW] Network failed for chunk, trying cache:', url.pathname);
          return caches.match(request);
        })
    );
  } else if (url.pathname.includes('/_next/static/')) {
    // Other static assets: Cache-first
    event.respondWith(
      caches.match(request)
        .then(response => {
          if (response) {
            return response;
          }
          return fetch(request).then(networkResponse => {
            if (networkResponse.ok) {
              const responseClone = networkResponse.clone();
              caches.open(CACHE_NAME).then(cache => {
                cache.put(request, responseClone);
              });
            }
            return networkResponse;
          });
        })
    );
  } else if (urlsToCache.includes(url.pathname) || url.pathname === '/') {
    // Core pages: Cache-first with network fallback
    event.respondWith(
      caches.match(request)
        .then(response => {
          if (response) {
            return response;
          }
          return fetch(request).then(networkResponse => {
            if (networkResponse.ok) {
              const responseClone = networkResponse.clone();
              caches.open(CACHE_NAME).then(cache => {
                cache.put(request, responseClone);
              });
            }
            return networkResponse;
          });
        })
        .catch(() => {
          // If both cache and network fail, try to serve index for navigation
          if (request.mode === 'navigate') {
            return caches.match('/');
          }
        })
    );
  } else {
    // Everything else: Network-first
    event.respondWith(
      fetch(request)
        .catch(() => {
          // For navigation requests, fallback to cached index
          if (request.mode === 'navigate') {
            return caches.match('/');
          }
        })
    );
  }
});

// Background sync for notifications
self.addEventListener('sync', event => {
  console.log('[SW] Background sync event:', event.tag);
  
  if (event.tag === 'check-notifications') {
    event.waitUntil(
      self.clients.matchAll().then(clients => {
        if (clients.length > 0) {
          clients[0].postMessage({ type: 'CHECK_NOTIFICATIONS_REQUEST' });
        } else {
          // Fallback notification when no clients available
          return self.registration.showNotification('BG Events', {
            body: 'Check for new events and updates',
            icon: '/icon-192x192.png',
            tag: 'background-check',
            data: { url: '/' }
          });
        }
      })
    );
  }
});

// Push notifications
self.addEventListener('push', event => {
  console.log('[SW] Push received');
  
  let data = {
    title: 'BG Events',
    body: 'You have a new notification',
    icon: '/icon-192x192.png',
    badge: '/icon-192x192.png'
  };

  if (event.data) {
    try {
      Object.assign(data, event.data.json());
    } catch {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: data.icon,
    badge: data.badge,
    tag: 'bg-events',
    data: { url: data.url || '/' },
    requireInteraction: false,
    silent: false,
    vibrate: [200, 100, 200]
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Notification click handler
self.addEventListener('notificationclick', event => {
  console.log('[SW] Notification click', event.action);
  event.notification.close();

  if (event.action === 'view' || !event.action) {
    event.waitUntil(
      self.clients.matchAll({ type: 'window' }).then(clients => {
        // Try to focus existing window
        for (const client of clients) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            return client.focus();
          }
        }
        // Open new window
        return self.clients.openWindow('/');
      })
    );
  }
});

// Handle chunk loading errors by clearing cache
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'CLEAR_CHUNK_CACHE') {
    event.waitUntil(
      caches.open(CACHE_NAME).then(cache => {
        return cache.keys().then(requests => {
          return Promise.all(
            requests
              .filter(request => request.url.includes('/_next/static/chunks/'))
              .map(request => cache.delete(request))
          );
        });
      }).then(() => {
        console.log('[SW] Chunk cache cleared');
        // Notify client that cache is cleared
        event.ports[0].postMessage({ success: true });
      })
    );
  }
});