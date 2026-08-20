// Отдельный service worker специально для Firebase Cloud Messaging — регистрируется из
// src/lib/webPush.ts. Firebase требует именно это имя файла (или явную передачу пути при
// регистрации, что мы и делаем) и именно такую структуру — SDK сам ловит событие push и
// вызывает showNotification() через onBackgroundMessage(), вручную event.data.json() парсить
// не нужно, в отличие от старого public/sw.js (VAPID/web-push).

importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js");

// Публичные ключи Firebase не секретны (это client-side конфиг, тот же, что в src/lib/firebase.ts) —
// сервис-воркеры не имеют доступа к переменным окружения сборки, поэтому значения здесь
// приходится продублировать буквально. Если когда-нибудь меняли Firebase-проект — обнови и тут.
firebase.initializeApp({
  apiKey: "REPLACE_WITH_NEXT_PUBLIC_FIREBASE_API_KEY",
  authDomain: "REPLACE_WITH_NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  projectId: "REPLACE_WITH_NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  storageBucket: "REPLACE_WITH_NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
  messagingSenderId: "REPLACE_WITH_NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
  appId: "REPLACE_WITH_NEXT_PUBLIC_FIREBASE_APP_ID",
});

const messaging = firebase.messaging();

// Показываем уведомление, когда вкладка сайта не активна/закрыта (фоновые сообщения).
// Формат payload — тот же, что шлёт webPushServer.ts: { notification: { title, body }, webpush: { fcmOptions: { link } } }
messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || "Velox Trade";
  const url = payload.fcmOptions?.link || payload.data?.url || "/";

  self.registration.showNotification(title, {
    body: payload.notification?.body || "У вас новое уведомление",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: { url },
    vibrate: [100, 50, 100],
  });
});

// Клик по уведомлению — открываем нужную страницу (или фокусируем уже открытую вкладку).
// Идентично public/sw.js, чтобы поведение не различалось между двумя service worker'ами сайта.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        const clientUrl = new URL(client.url).pathname;
        if (clientUrl === targetUrl && "focus" in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
