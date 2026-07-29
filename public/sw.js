// Sellz POS — push-bildirishnomalarni qabul qilish uchun Service Worker

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = { title: 'Sellz', body: 'Yangi bildirishnoma' };
  try { data = event.data.json(); } catch { /* matn formatida kelsa ham chidamli bo'lsin */ }

  event.waitUntil(
    self.registration.showNotification(data.title || 'Sellz', {
      body: data.body || '',
      icon: data.icon || '/favicon.png',
      badge: '/favicon.png',
      tag: 'sellz-daily-greeting',
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsArr) => {
      const existing = clientsArr.find((c) => c.url.includes(self.location.origin));
      if (existing) return existing.focus();
      return self.clients.openWindow('/');
    })
  );
});
