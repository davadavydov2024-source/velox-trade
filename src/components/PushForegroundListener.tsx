"use client";

import { useEffect } from "react";
import { useAuth } from "@/lib/authContext";
import { useToast } from "@/lib/toastContext";
import { activeApp } from "@/lib/firebase";

/**
 * FCM показывает системное уведомление сам, только когда сайт закрыт или вкладка в фоне. Если
 * сайт открыт и в фокусе, сообщение молча приходит в onMessage и пользователь НИЧЕГО не видит —
 * из-за этого казалось, что «пуши не работают». Здесь показываем такое сообщение тостом со ссылкой.
 */
export function PushForegroundListener() {
  const { user } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (!user || typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "granted") return;

    let unsub: (() => void) | null = null;
    let cancelled = false;
    (async () => {
      try {
        const { isSupported, getMessaging, onMessage } = await import("firebase/messaging");
        if (!(await isSupported()) || cancelled) return;
        unsub = onMessage(getMessaging(activeApp), (payload) => {
          const title = payload.notification?.title ?? "Уведомление";
          const body = payload.notification?.body;
          const link = payload.data?.url ?? payload.fcmOptions?.link;
          let href: string | undefined;
          try {
            if (link) href = new URL(link).pathname;
          } catch {
            href = undefined;
          }
          toast("info", body ? `${title}: ${body}` : title, href);
        });
      } catch {
        // Не критично — без этого уведомления просто не будут дублироваться тостом при открытом сайте.
      }
    })();
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [user, toast]);

  return null;
}
