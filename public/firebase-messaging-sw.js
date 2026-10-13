/* Service worker для push-уведомлений (FCM).
 *
 * Принципиально БЕЗ importScripts с gstatic.com: раньше SW подгружал Firebase SDK с чужого
 * домена, и если он не загружался (блокировки, плохая сеть), push молча не показывался.
 * Для приёма пушей SDK внутри SW не нужен — достаточно события "push".
 *
 * Сервер шлёт data-only сообщения: { title, body, url, icon, tag } лежат в payload.data.
 * Регистрируется на отдельном scope (/firebase-cloud-messaging-push-scope), чтобы не конфликтовать
 * с основным /sw.js — два SW на одном scope вытесняют друг друга, и push переставал приходить.
 */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (e) {
    payload = { data: { body: event.data ? event.data.text() : "" } };
  }
  const d = payload.data || {};
  const n = payload.notification || {};

  const title = d.title || n.title || "Velox Trade";
  const options = {
    body: d.body || n.body || "",
    icon: d.icon || n.icon || "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: d.tag || undefined,
    renotify: !!d.tag,
    data: { url: d.url || "/" },
  };
  // Браузер (особенно iOS) требует показать уведомление на каждый push — иначе подписку отзывают.
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";
  const url = new URL(target, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (list) => {
      for (const client of list) {
        if (new URL(client.url).origin === self.location.origin && "focus" in client) {
          await client.focus();
          if ("navigate" in client) {
            try {
              await client.navigate(url);
            } catch (e) {
              /* вкладку нельзя перенаправить — просто оставим её в фокусе */
            }
          }
          return;
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
