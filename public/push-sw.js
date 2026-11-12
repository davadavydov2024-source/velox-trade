/* Service worker для Web Push (VAPID). Регистрируется из src/lib/webPush.ts со scope "/push-scope/".
   Сервер (src/lib/webPushServer.ts) шлёт JSON: { title, body, icon, url }. */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "MiliGram";
  const options = {
    body: data.body || "",
    icon: data.icon || "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: { url: data.url || "/m" },
    tag: data.tag || undefined,
    renotify: !!data.tag,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/m";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      const origin = self.location.origin;
      let url;
      try { url = new URL(target, origin).toString(); } catch (e) { url = origin + "/m"; }
      if (new URL(url).origin !== origin) url = origin + "/m"; // чужие адреса не открываем
      for (const c of list) {
        if (c.url.startsWith(origin) && "focus" in c) {
          c.focus();
          if ("navigate" in c) return c.navigate(url).catch(() => {});
          return;
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
