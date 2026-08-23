// Service worker для Velox Trade.
// Push-уведомления теперь идут через отдельный public/firebase-messaging-sw.js (Firebase Cloud
// Messaging) — см. src/lib/webPush.ts. Этот файл отвечает только за офлайн-кэширование и клик
// по уведомлению (на случай, если оба service worker'а активны одновременно).

const CACHE_NAME = 'velox-trade-cache-v1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

// Клик по уведомлению — открываем нужную страницу (или фокусируем уже открытую вкладку)
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        const clientUrl = new URL(client.url).pathname;
        if (clientUrl === targetUrl && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});

// Базовое кэширование для офлайн-режима (не мешает push, просто улучшает PWA-оценку).
// network-first: сначала пробуем сеть, в кэш падаем только если сеть недоступна.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  // Кэшируем только собственные ответы (same-origin, статус 200) — cross-origin opaque-ответы
  // (сторонние картинки/шрифты без CORS) Cache.put() иногда не может сохранить и бросает
  // NetworkError, а нам их офлайн-версия всё равно не нужна.
  const isSameOrigin = new URL(event.request.url).origin === self.location.origin;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (isSameOrigin && response.ok) {
          const responseClone = response.clone();
          caches
            .open(CACHE_NAME)
            .then((cache) => cache.put(event.request, responseClone))
            .catch(() => {
              // Запрос мог прерваться (вкладка закрылась, навигация ушла дальше) уже после того,
              // как fetch() успел отдать ответ — сам put() в такой момент падает с NetworkError.
              // Ничего не теряем: просто эта версия страницы не попадёт в офлайн-кэш.
            });
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
