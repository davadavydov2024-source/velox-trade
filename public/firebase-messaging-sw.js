// Отдельный service worker специально для Firebase Cloud Messaging — регистрируется из
// src/lib/webPush.ts. Firebase требует именно это имя файла (или явную передачу пути при
// регистрации, что мы и делаем) и именно такую структуру — SDK сам ловит событие push и
// вызывает showNotification() через onBackgroundMessage(), вручную event.data.json() парсить
// не нужно.

importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js");

// Публичные ключи Firebase не секретны (это client-side конфиг, тот же, что в src/lib/firebase.ts) —
// сервис-воркеры не имеют доступа к переменным окружения сборки, поэтому значения здесь
// продублированы буквально из Firebase Console → Project settings → Your apps.
firebase.initializeApp({
  apiKey: "AIzaSyAF5IihdpySoQQS-cVoi5paTiHbJ2R-oJQ",
  authDomain: "blade-shoop.firebaseapp.com",
  projectId: "blade-shoop",
  storageBucket: "blade-shoop.firebasestorage.app",
  messagingSenderId: "482950290327",
  appId: "1:482950290327:web:469b993a8f947a9f9342d2",
});

const messaging = firebase.messaging();

// Показываем уведомление, когда вкладка сайта не активна/закрыта (фоновые сообщения).
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
