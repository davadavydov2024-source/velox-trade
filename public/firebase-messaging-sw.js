// Service worker для Firebase Cloud Messaging (веб-пуши).
// Регистрируется из src/lib/webPush.ts как navigator.serviceWorker.register("/firebase-messaging-sw.js").
//
// ВАЖНО: service worker'ы не имеют доступа к process.env во время выполнения в браузере —
// поэтому конфиг Firebase здесь продублирован как обычные значения, а не переменные окружения.
// Значения такие же, как в NEXT_PUBLIC_FIREBASE_* (см. .env.local.example) — они и так публичные
// (специально предназначены для клиента), поэтому хранить их прямо в файле безопасно.
importScripts("https://www.gstatic.com/firebasejs/10.12.4/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.4/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyAF5IihdpySoQQS-cVoi5paTiHbJ2R-oJQ",
  authDomain: "blade-shoop.firebaseapp.com",
  projectId: "blade-shoop",
  storageBucket: "blade-shoop.firebasestorage.app",
  messagingSenderId: "482950290327",
  appId: "1:482950290327:web:469b993a8f947a9f9342d2",
});

const messaging = firebase.messaging();

// Показываем уведомление, когда сайт закрыт/свёрнут (пуш пришёл в фоне).
// Пока сайт открыт во вкладке, foreground-сообщения обрабатывает onMessage() в самом приложении
// (если он подключён) — тут только фоновый случай, это стандартная схема FCM.
messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || payload.data?.title || "Velox Trade";
  const body = payload.notification?.body || payload.data?.body || "";
  const url = payload.data?.url || "/";

  self.registration.showNotification(title, {
    body,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: { url },
  });
});

// Клик по уведомлению — открыть (или сфокусировать) сайт на нужной странице.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
