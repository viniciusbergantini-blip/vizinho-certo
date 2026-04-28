// Vizinho Certo — Service Worker
const CACHE_NAME = 'vizinho-certo-v1';

self.addEventListener('install', e => {
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(clients.claim());
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
    icon: '/icon.svg',
    badge: '/icon.svg',
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
