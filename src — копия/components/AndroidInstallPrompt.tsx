"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

const DISMISS_KEY = "vt_android_install_dismissed";

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (window.navigator as any).standalone === true || window.matchMedia("(display-mode: standalone)").matches;
}

// Тип из спецификации beforeinstallprompt — TypeScript/lib.dom.d.ts его не включает.
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * Аналог IosInstallPrompt.tsx, но для Android/Chrome (и десктоп-Chrome/Edge) — там установка
 * идёт не через ручную инструкцию «Поделиться → На экран Домой», а через нативный браузерный
 * диалог, который вызывается программно. Событие beforeinstallprompt срабатывает у Chrome САМ —
 * но только если сайт проходит PWA-критерии (валидный manifest.json + зарегистрированный service
 * worker, оба уже есть в проекте), и только один раз за сессию, поэтому его обязательно нужно
 * поймать и сохранить, иначе кнопку "Установить" вызвать будет нечем.
 */
export function AndroidInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;
    if (localStorage.getItem(DISMISS_KEY)) return;

    function handleBeforeInstallPrompt(e: Event) {
      e.preventDefault(); // отменяем автоматический мини-баннер Chrome — покажем свой, в стиле сайта
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setVisible(true);
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    // Если пользователь всё же установил приложение (через меню браузера, а не наш баннер) —
    // прячем баннер сразу, не дожидаясь перезагрузки страницы.
    function handleAppInstalled() {
      setVisible(false);
      localStorage.setItem(DISMISS_KEY, "1");
    }
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  if (!visible || !deferredPrompt) return null;

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "1");
    setVisible(false);
  }

  async function handleInstall() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    // Каждый BeforeInstallPromptEvent одноразовый — использован он или нет, ждём выбора юзера
    // и в любом случае прячем баннер (Chrome не даст вызвать prompt() на нём повторно).
    await deferredPrompt.userChoice.catch(() => {});
    setDeferredPrompt(null);
    dismiss();
  }

  return (
    <button
      type="button"
      onClick={handleInstall}
      className="fixed left-1/2 -translate-x-1/2 bottom-20 lg:bottom-5 z-[90] flex items-center gap-2 bg-accent text-black text-sm font-semibold pl-4 pr-2 py-2.5 rounded-full shadow-glow"
    >
      <Download size={16} /> Установить приложение
      <span
        onClick={(e) => {
          e.stopPropagation();
          dismiss();
        }}
        className="ml-1 p-1 rounded-full hover:bg-black/10"
        aria-label="Скрыть"
      >
        <X size={14} />
      </span>
    </button>
  );
}
