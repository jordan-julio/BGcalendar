// public/sw.js

const CACHE_NAME = 'bg-events-app-v1.2'; // bump to force refresh
const urlsToCache = [
  '/',
  '/login',
  '/manifest.json',
  '/icon-192x192.png',
  '/icon-512x512.png',
  '/favicon.ico'
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

// Push notifications
self.addEventListener('push', event => {
  console.log('[SW] Push received');
  let data = {
    title: 'BG Events',
    body: 'You have a new notification',
    icon: '/icon-192x192.png',
    badge: '/icon-192x192.png',
    eventId: null
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
    vibrate: [100, 50, 100],
    tag: 'bg-events',
    data: {
      url: data.url || '/'
    },
    actions: [
      { action: 'view', title: 'View Event' },
      { action: 'dismiss', title: 'Dismiss' }
    ],
    requireInteraction: true
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Notification click
self.addEventListener('notificationclick', event => {
  console.log('[SW] Notification click', event.action);
  event.notification.close();

  if (event.action === 'view' || !event.action) {
    event.waitUntil(
      clients.matchAll({ type: 'window' }).then(list => {
        for (const client of list) {
          if (client.url === self.location.origin + '/' && 'focus' in client) {
            return client.focus();
          }
        }
        return clients.openWindow('/');
      })
    );
  }
});

// Background sync (placeholder)
self.addEventListener('sync', event => {
  if (event.tag === 'background-sync') {
    event.waitUntil(console.log('[SW] Background sync'));
  }
});
