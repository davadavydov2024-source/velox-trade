"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@/lib/authContext";
import { useToast } from "@/lib/toastContext";
import { subscribeUserOrderChats } from "@/lib/orderChats";
import { subscribeUserTickets } from "@/lib/tickets";

const ORIGINAL_TITLE = typeof document !== "undefined" ? document.title : "Velox Trade";

/** Короткий "дзинь" через Web Audio API — без отдельного mp3-файла в public/. Два коротких тона,
 * затухающих по громкости. Автоплей звука иногда блокируется браузером до первого взаимодействия
 * пользователя со страницей — тогда просто ничего не звучит, тихо игнорируем. */
function playChime() {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    [880, 1320].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      osc.type = "sine";
      gain.gain.setValueAtTime(0.001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.01 + i * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3 + i * 0.08);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.08);
      osc.stop(ctx.currentTime + 0.4 + i * 0.08);
    });
    setTimeout(() => ctx.close(), 600);
  } catch {
    // см. комментарий выше
  }
}

/**
 * Живой слушатель новых сообщений, пока пользователь на сайте — Telegram-уведомления уже
 * приходят в бота (см. lib/telegramNotify), а этот компонент дублирует то же самое всплывающим
 * тостом прямо на сайте, если человек сейчас онлайн. Дополнительно: если вкладка в этот момент
 * не в фокусе (открыта в фоне или человек смотрит в другое приложение) — играет короткий звук и
 * начинает мигать заголовком вкладки ("(1) Новое сообщение"), пока пользователь не вернётся —
 * иначе легко пропустить сообщение, если сайт просто открыт где-то на фоне без push-уведомлений.
 */
export function GlobalMessageListener() {
  const { user } = useAuth();
  const { toast } = useToast();
  // На каждый чат/тикет запоминаем последний увиденный updatedAt, чтобы не показывать тост
  // на самом первом снепшоте (иначе при каждом заходе на сайт вылезла бы куча старых уведомлений).
  const seen = useRef<Map<string, number>>(new Map());
  const ready = useRef(false);
  const blinkTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const unreadCount = useRef(0);

  useEffect(() => {
    function stopBlinking() {
      if (blinkTimer.current) {
        clearInterval(blinkTimer.current);
        blinkTimer.current = null;
      }
      unreadCount.current = 0;
      document.title = ORIGINAL_TITLE;
    }

    function onNewMessage() {
      playChime();
      if (document.visibilityState === "hidden" || !document.hasFocus()) {
        unreadCount.current += 1;
        if (!blinkTimer.current) {
          let showAlert = true;
          blinkTimer.current = setInterval(() => {
            document.title = showAlert ? `(${unreadCount.current}) Новое сообщение` : ORIGINAL_TITLE;
            showAlert = !showAlert;
          }, 1000);
        }
      }
    }

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") stopBlinking();
    });
    window.addEventListener("focus", stopBlinking);

    if (!user) return () => window.removeEventListener("focus", stopBlinking);
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
        onNewMessage();
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
        onNewMessage();
      }
    });

    return () => {
      clearTimeout(readyTimer);
      unsubChats();
      unsubTickets();
      window.removeEventListener("focus", stopBlinking);
      stopBlinking();
    };
  }, [user, toast]);

  return null;
}
