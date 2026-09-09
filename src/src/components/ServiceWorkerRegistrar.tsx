"use client";

import { useEffect } from "react";

/**
 * Регистрирует public/sw.js сразу при загрузке сайта, а не дожидаясь, пока пользователь включит
 * push-уведомления (там регистрируется отдельный firebase-messaging-sw.js, см. lib/webPush.ts).
 * Без активного service worker'а Chrome не считает сайт установливаемым PWA и никогда не
 * присылает событие beforeinstallprompt — соответственно AndroidInstallPrompt.tsx не может
 * показать кнопку "Установить приложение". Компонент ничего не рендерит, только эффект.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Не критично — офлайн-кэш и "Установить приложение" просто будут недоступны в этом
      // браузере (например, приватный режим Safari, где регистрация SW иногда запрещена).
    });
  }, []);

  return null;
}
