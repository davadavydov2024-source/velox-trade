"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@/lib/authContext";
import { useToast } from "@/lib/toastContext";

const TELEGRAM_BOT = process.env.NEXT_PUBLIC_TELEGRAM_BOT || "veloxtrade_robot";

interface TelegramWidgetUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

declare global {
  interface Window {
    onTelegramAuth?: (user: TelegramWidgetUser) => void;
  }
}

/**
 * Официальный Telegram Login Widget (https://core.telegram.org/widgets/login) — рендерится самим
 * Telegram через встроенный <script>, поэтому сначала показываем пустой контейнер и подставляем
 * скрипт в него через ref, а не пишем разметку кнопки вручную. Требует, чтобы домен сайта был
 * добавлен боту через @BotFather → /setdomain, иначе виджет откажется грузиться — см. итоговое
 * сообщение с инструкцией.
 */
export function TelegramLoginWidget() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { loginWithCustomToken } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    window.onTelegramAuth = async (tgUser: TelegramWidgetUser) => {
      try {
        const res = await fetch("/api/auth/telegram-widget", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(tgUser),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Не удалось войти через Telegram");
        await loginWithCustomToken(data.token);
        toast("success", "Вход через Telegram выполнен!");
      } catch (err: any) {
        toast("error", err?.message || "Не удалось войти через Telegram");
      }
    };

    if (containerRef.current && containerRef.current.childElementCount === 0) {
      const script = document.createElement("script");
      script.src = "https://telegram.org/js/telegram-widget.js?22";
      script.async = true;
      script.setAttribute("data-telegram-login", TELEGRAM_BOT);
      script.setAttribute("data-size", "large");
      script.setAttribute("data-radius", "10");
      script.setAttribute("data-onauth", "onTelegramAuth(user)");
      script.setAttribute("data-request-access", "write");
      containerRef.current.appendChild(script);
    }

    return () => {
      delete window.onTelegramAuth;
    };
  }, [loginWithCustomToken, toast]);

  return <div ref={containerRef} className="flex justify-center" />;
}
