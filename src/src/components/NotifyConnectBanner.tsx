"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell, X } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { getTelegramLink } from "@/lib/telegramLink";
import { isPushSupported, hasActiveSubscription } from "@/lib/webPush";

/**
 * Показывается, только если у пользователя НЕ подключены ни Telegram, ни push-уведомления —
 * иначе он рискует пропустить важное событие (новое предложение обмена, сообщение в чате и т.п.),
 * просто не заходя на сайт вовремя. Можно закрыть — держим "не показывать" per-storageKey,
 * чтобы разные страницы не спамили один и тот же баннер повторно после закрытия.
 */
export function NotifyConnectBanner({ context, storageKey }: { context: string; storageKey: string }) {
  const { user } = useAuth();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!user) return;
    if (localStorage.getItem(storageKey) === "1") return;

    Promise.all([
      getTelegramLink(user.uid).then((link) => !!link),
      isPushSupported() ? hasActiveSubscription(user.uid) : Promise.resolve(true), // не поддерживается — не считаем это "не подключено"
    ]).then(([hasTelegram, hasPush]) => {
      if (!hasTelegram && !hasPush) setShow(true);
    });
  }, [user, storageKey]);

  if (!show) return null;

  function dismiss() {
    localStorage.setItem(storageKey, "1");
    setShow(false);
  }

  return (
    <div className="card p-3.5 mb-4 flex items-start gap-3 border border-accent/20">
      <Bell size={16} className="text-accent shrink-0 mt-0.5" />
      <div className="min-w-0 flex-1">
        <p className="text-sm text-white/80">
          Подключи Telegram или push-уведомления, чтобы не пропустить {context} — сайт сообщит сразу, даже если вкладка закрыта.
        </p>
        <Link href="/profile/security" className="text-xs text-accent hover:underline font-medium mt-1 inline-block">
          Настроить уведомления →
        </Link>
      </div>
      <button onClick={dismiss} className="text-white/30 hover:text-white shrink-0 p-1">
        <X size={14} />
      </button>
    </div>
  );
}
