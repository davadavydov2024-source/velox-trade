/* Service worker для push-уведомлений (стандартный Web Push + VAPID, без Firebase).
 *
 * Сервер шлёт JSON { title, body, url, icon, tag }. Регистрируется на отдельном scope
 * (/push-scope/), чтобы не конфликтовать с основным /sw.js: два SW на одном scope вытесняют
 * друг друга, и push переставал приходить.
 */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let d = {};
  try {
    d = event.data ? event.data.json() : {};
  } catch (e) {
    d = { body: event.data ? event.data.text() : "" };
  }
  const title = d.title || "Velox Trade";
  const options = {
    body: d.body || "",
    icon: d.icon || "/icons/icon-192.png",
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
