// public/sw.js - Simplified version focused on core functionality

const CACHE_NAME = 'bg-events-app-v1.4';
const urlsToCache = [
  '/',
  '/login',
  '/manifest.json',
  '/icon-192x192.png',
  '/icon-512x512.png',
];

// Install: cache app shell
self.addEventListener('install', event => {
  console.log('[SW] Install');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
      .then(() => self.skipWaiting())
  );
});

// Activate: clear old caches
self.addEventListener('activate', event => {
  console.log('[SW] Activate');
  event.waitUntil(
    caches.keys()
      .then(names => Promise.all(
        names.map(name => {
          if (name !== CACHE_NAME) {
            console.log('[SW] Deleting cache', name);
            return caches.delete(name);
          }
        })
      ))
      .then(() => self.clients.claim())
  );
});

// Fetch: cache-first for static assets
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' ||
      !event.request.url.startsWith(self.location.origin)) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(resp => resp || fetch(event.request).then(networkResp => {
        if (!networkResp || networkResp.status !== 200 || networkResp.type !== 'basic') {
          return networkResp;
        }
        const clone = networkResp.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return networkResp;
      }))
      .catch(() => {
        if (event.request.mode === 'navigate') {
          return caches.match('/');
        }
      })
  );
});

// Background sync for checking notifications
self.addEventListener('sync', event => {
  console.log('[SW] Background sync event:', event.tag);
  
  if (event.tag === 'check-notifications') {
    event.waitUntil(
      self.clients.matchAll().then(clients => {
        if (clients.length > 0) {
          // Tell the client to check notifications
          clients[0].postMessage({ type: 'CHECK_NOTIFICATIONS_REQUEST' });
        }
      })
    );
  }
});

// Push notifications (for server-sent notifications if you implement them later)
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

self.addEventListener('sync', event => {
  console.log('[SW] Background sync event:', event.tag);
  
  if (event.tag === 'check-notifications') {
    event.waitUntil(
      self.clients.matchAll().then(clients => {
        if (clients.length > 0) {
          clients[0].postMessage({ type: 'CHECK_NOTIFICATIONS_REQUEST' });
        } else {
          // No clients available, try to show a generic notification
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