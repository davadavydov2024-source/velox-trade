"use client";

import { useEffect } from "react";
import { useAuth } from "@/lib/authContext";
import { syncPushSubscriptionSilently } from "@/lib/webPush";

/**
 * При каждом входе тихо обновляет push-подписку этого устройства, если уведомления уже разрешены:
 * токены FCM со временем меняются, а после смены аккаунта на этом браузере токен нужно
 * перепривязать. Без этого уведомления могли «тихо отвалиться» у тех, кто включил их давно.
 * Показом самих уведомлений занимается service worker (public/firebase-messaging-sw.js).
 */
export function PushForegroundListener() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    const t = setTimeout(() => {
      syncPushSubscriptionSilently().catch(() => {});
    }, 3000); // не мешаем первой загрузке страницы
    return () => clearTimeout(t);
  }, [user?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
