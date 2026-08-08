"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@/lib/authContext";
import { useToast } from "@/lib/toastContext";
import { subscribeUserOrderChats } from "@/lib/orderChats";
import { subscribeUserTickets } from "@/lib/tickets";

/**
 * Живой слушатель новых сообщений, пока пользователь на сайте — Telegram-уведомления уже
 * приходят в бота (см. lib/telegramNotify), а этот компонент дублирует то же самое всплывающим
 * тостом прямо на сайте, если человек сейчас онлайн. Ничего не рендерит — только слушает.
 */
export function GlobalMessageListener() {
  const { user } = useAuth();
  const { toast } = useToast();
  // На каждый чат/тикет запоминаем последний увиденный updatedAt, чтобы не показывать тост
  // на самом первом снепшоте (иначе при каждом заходе на сайт вылезла бы куча старых уведомлений).
  const seen = useRef<Map<string, number>>(new Map());
  const ready = useRef(false);

  useEffect(() => {
    if (!user) return;
    seen.current = new Map();
    ready.current = false;
    // Небольшая задержка перед тем, как начать реагировать на изменения — даём первому
    // снепшоту от каждой подписки долететь и заполнить baseline.
    const readyTimer = setTimeout(() => {
      ready.current = true;
    }, 1500);

    const unsubChats = subscribeUserOrderChats(user.uid, (chats) => {
      for (const chat of chats) {
        const key = `chat:${chat.orderId}`;
        const prev = seen.current.get(key);
        seen.current.set(key, chat.updatedAt);
        if (!ready.current || prev === undefined || chat.updatedAt <= prev) continue;
        const last = chat.messages[chat.messages.length - 1];
        if (!last || last.from === "system") continue;
        const isMine = (last.from === "buyer" && chat.buyerId === user.uid) || (last.from === "seller" && chat.sellerId === user.uid);
        if (isMine) continue;
        toast("info", `💬 Новое сообщение в чате по заказу: ${last.text.slice(0, 80)}`, "/chats");
      }
    });

    const unsubTickets = subscribeUserTickets(user.uid, (tickets) => {
      for (const t of tickets) {
        const key = `ticket:${t.id}`;
        const prev = seen.current.get(key);
        seen.current.set(key, t.updatedAt);
        if (!ready.current || prev === undefined || t.updatedAt <= prev) continue;
        const last = t.messages[t.messages.length - 1];
        if (!last || last.from !== "admin") continue;
        toast("info", `💬 Ответ в поддержке: ${last.text.slice(0, 80)}`, "/chats?tab=support");
      }
    });

    return () => {
      clearTimeout(readyTimer);
      unsubChats();
      unsubTickets();
    };
  }, [user, toast]);

  return null;
}
