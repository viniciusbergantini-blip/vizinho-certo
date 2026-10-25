// Vizinho Certo — Service Worker
const CACHE_NAME = 'vizinho-certo-static-v5';
const STATIC_ASSETS = [
  '/offline.html',
  '/app-runtime.js',
  '/install-app.js',
  '/engagement.js',
  '/landing.css',
  '/landing-page.js',
  '/landing-session.js',
  '/manifest.json',
  '/icon.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => Promise.allSettled(STATIC_ASSETS.map(asset => cache.add(asset))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const request = e.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    e.respondWith(fetch(request).catch(() => caches.match('/offline.html')));
    return;
  }

  if (!STATIC_ASSETS.includes(url.pathname)) return;
  e.respondWith(
    caches.match(request).then(cached => cached || fetch(request).then(response => {
      if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()));
      return response;
    }))
  );
});

// Recebe notificação push
self.addEventListener('push', e => {
  if (!e.data) return;

  let data;
  try {
    data = e.data.json();
  } catch {
    data = { title: 'Vizinho Certo', body: e.data.text() };
  }

  const options = {
    body: data.body || 'Nova atividade na sua vizinhança!',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [200, 100, 200],
    data: { url: data.url || '/app' },
    actions: [
      { action: 'open', title: 'Ver agora' },
      { action: 'close', title: 'Fechar' }
    ]
  };

  e.waitUntil(
    self.registration.showNotification(data.title || 'Vizinho Certo 🏘️', options)
  );
});

// Clique na notificação
self.addEventListener('notificationclick', e => {
  e.notification.close();

  if (e.action === 'close') return;

  const url = e.notification.data?.url || '/app';

  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      // Se já tem o app aberto, foca nele
      for (const client of clientList) {
        if (client.url.includes('vizinhocerto') && 'focus' in client) {
          return client.focus();
        }
      }
      // Senão abre uma nova aba
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});
