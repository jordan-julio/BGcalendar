/* eslint-disable @typescript-eslint/no-unused-vars */
// public/firebase-messaging-sw.js (Clean version without conflicts)
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-messaging-compat.js');

// Initialize Firebase in the service worker
firebase.initializeApp({
  apiKey: "AIzaSyBaiQkoUMxMX3wE_tdyMJiOpRnC3oLMBt8",
  authDomain: "calendarbg-b8b21.firebaseapp.com",
  projectId: "calendarbg-b8b21",
  storageBucket: "calendarbg-b8b21.appspot.com",
  messagingSenderId: "966785744813",
  appId: "1:966785744813:web:6f9affcc6adb8687366b24"
});

// Retrieve an instance of Firebase Messaging
const messaging = firebase.messaging();

// Handle background messages
messaging.onBackgroundMessage(function(payload) {
  console.log('📨 [Firebase SW] Received background message:', payload);
  
  // Extract notification data with fallbacks
  const notificationTitle = payload.notification?.title || payload.data?.title || 'BG Events';
  const notificationBody = payload.notification?.body || payload.data?.body || 'You have a new notification';
  
  // Create notification options
  const notificationOptions = {
    body: notificationBody,
    tag: payload.data?.type || 'bg-events',
    data: payload.data || {},
    requireInteraction: true,
    silent: false,
    vibrate: [200, 100, 200],
    actions: [
      {
        action: 'view',
        title: 'View Calendar'
      },
      {
        action: 'dismiss',
        title: 'Dismiss'
      }
    ]
  };

  console.log('📱 [Firebase SW] Showing notification:', { title: notificationTitle, body: notificationBody });

  // Show the notification using service worker registration
  return self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification clicks
self.addEventListener('notificationclick', function(event) {
  console.log('📱 [Firebase SW] Notification clicked:', event.action);
  
  event.notification.close();
  
  if (event.action === 'view') {
    // Open the calendar page
    event.waitUntil(
      clients.openWindow('/').catch(err => {
        console.error('[Firebase SW] Failed to open window:', err);
      })
    );
  } else if (event.action === 'dismiss') {
    // Just close the notification (already done above)
    console.log('[Firebase SW] Notification dismissed');
  } else {
    // Default action - open the app
    event.waitUntil(
      clients.openWindow('/').catch(err => {
        console.error('[Firebase SW] Failed to open window:', err);
      })
    );
  }
});

// Handle service worker installation
self.addEventListener('install', function(event) {
  console.log('🔧 [Firebase SW] Installing...');
  // Skip waiting to activate immediately
  self.skipWaiting();
});

// Handle service worker activation
self.addEventListener('activate', function(event) {
  console.log('🔧 [Firebase SW] Activating...');
  // Take control of all clients immediately
  event.waitUntil(self.clients.claim());
});