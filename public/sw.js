// public/sw.js - Combined PWA + FCM Service Worker

// Import Firebase scripts
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging-compat.js');

// Initialize Firebase (replace with your config)
firebase.initializeApp({
  apiKey: process.env.NEXT_PUBLIC_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_AUTH_DOMAIN,
  projectId: "calendarbg-b8b21",
  storageBucket: process.env.NEXT_PUBLIC_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_APP_ID,
  measurementId: "G-0HS8NL71G1"
});

// Initialize Firebase Messaging
const messaging = firebase.messaging();

// Cache configuration
const CACHE_NAME = 'bg-events-app-v1.6';
const urlsToCache = [
  '/',
  '/login',
  '/manifest.json',
  '/icon-192x192.png',
  '/icon-512x512.png',
];

// Install event - cache assets
self.addEventListener('install', event => {
  console.log('[SW] Install v1.6 with FCM');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
      .then(() => self.skipWaiting())
      .catch(err => console.error('[SW] Cache failed:', err))
  );
});

// Activate event - clean old caches
self.addEventListener('activate', event => {
  console.log('[SW] Activate v1.6 with FCM');
  event.waitUntil(
    Promise.all([
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
      self.clients.claim()
    ])
  );
});

// Fetch event - network first for chunks, cache first for assets
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET' || !url.origin.includes(self.location.origin)) {
    return;
  }

  if (url.pathname.includes('/_next/static/chunks/')) {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(request, responseClone);
            });
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
  } else if (urlsToCache.includes(url.pathname) || url.pathname === '/') {
    event.respondWith(
      caches.match(request)
        .then(response => response || fetch(request))
        .catch(() => {
          if (request.mode === 'navigate') {
            return caches.match('/');
          }
        })
    );
  }
});

// Handle FCM background messages
messaging.onBackgroundMessage((payload) => {
  console.log('[SW] Received FCM background message:', payload);
  
  const notificationTitle = payload.notification?.title || payload.data?.title || 'BG Events';
  const notificationOptions = {
    body: payload.notification?.body || payload.data?.body || 'You have a new notification',
    icon: payload.notification?.icon || '/icon-192x192.png',
    badge: '/icon-192x192.png',
    tag: payload.data?.tag || `fcm-${Date.now()}`,
    data: payload.data || {},
    requireInteraction: payload.data?.requireInteraction === 'true',
    vibrate: payload.data?.vibrate ? JSON.parse(payload.data.vibrate) : [200, 100, 200],
    actions: [
      {
        action: 'view',
        title: 'View Event'
      },
      {
        action: 'close',
        title: 'Close'
      }
    ]
  };

  return self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle Web Push API notifications (your existing notifications)
self.addEventListener('push', event => {
  console.log('[SW] Push received (Web Push)');
  
  if (event.data) {
    let data;
    try {
      data = event.data.json();
    } catch {
      data = {
        title: 'BG Events',
        body: event.data.text()
      };
    }

    const options = {
      body: data.body,
      icon: data.icon || '/icon-192x192.png',
      badge: data.badge || '/icon-192x192.png',
      tag: data.tag || 'bg-events',
      data: data.data || { url: '/' },
      requireInteraction: data.requireInteraction || false,
      vibrate: data.vibrate || [200, 100, 200]
    };

    event.waitUntil(
      self.registration.showNotification(data.title, options)
    );
  }
});

// Handle notification clicks (both FCM and Web Push)
self.addEventListener('notificationclick', event => {
  console.log('[SW] Notification click:', event.action);
  event.notification.close();

  if (event.action === 'close') {
    return;
  }

  const urlToOpen = event.notification.data?.url || event.notification.data?.click_action || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clientList => {
        // Try to focus existing window
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            client.focus();
            // Navigate to specific URL if needed
            if (urlToOpen !== '/' && client.navigate) {
              client.navigate(urlToOpen);
            }
            return;
          }
        }
        // Open new window if app not open
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      })
  );
});

// Background sync for checking notifications
self.addEventListener('sync', event => {
  console.log('[SW] Background sync:', event.tag);
  
  if (event.tag === 'check-notifications') {
    event.waitUntil(
      self.clients.matchAll().then(clients => {
        if (clients.length > 0) {
          clients[0].postMessage({ type: 'CHECK_NOTIFICATIONS_REQUEST' });
        }
      })
    );
  }
});

// Handle messages from the app
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'INIT_FCM') {
    console.log('[SW] FCM initialized from app');
  }
  
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
        event.ports[0].postMessage({ success: true });
      })
    );
  }
});

// Log for debugging
console.log('[SW] Service worker loaded with FCM support');