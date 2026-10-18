"use client";

import { ReactNode, useEffect, useMemo, useState } from "react";
import { EyeOff } from "lucide-react";
import { useAuth } from "@/lib/authContext";

/**
 * Защита конфиденциальности чата в браузере. Честно о пределах: веб-страница НЕ может запретить
 * системный скриншот или съёмку экрана камерой — этого не умеет ни один сайт. Здесь собраны меры,
 * которые реально работают:
 *  - чат размывается, когда вкладка/окно теряет фокус, сворачивается или открыт переключатель
 *    приложений (там делаются превью и часть записей экрана);
 *  - при нажатии клавиш скриншота (PrintScreen, Win+Shift+S, Cmd+Shift+3/4/5) чат на несколько
 *    секунд скрывается, а буфер обмена очищается;
 *  - копирование, контекстное меню и перетаскивание в чате отключены (кроме открытых паролей);
 *  - печать/«сохранить в PDF» даёт пустую страницу;
 *  - поверх чата — водяной знак с ником и ID: утечка скриншота сразу покажет, чей он;
 *  - пароли и коды в сообщениях спрятаны за кнопкой и сами скрываются (см. ChatMessageBody).
 */
export const CHAT_HIDE_EVENT = "chat-privacy-hide";

export function ChatPrivacyShield({ children }: { children: ReactNode }) {
  const { user, profile } = useAuth();
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const hide = () => {
      setHidden(true);
      window.dispatchEvent(new Event(CHAT_HIDE_EVENT));
    };
    const showSoon = (ms: number) => {
      clearTimeout(timer);
      timer = setTimeout(() => setHidden(false), ms);
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") hide();
      else showSoon(150);
    };
    const onBlur = () => hide();
    const onFocus = () => showSoon(150);
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      const screenshotCombo =
        e.key === "PrintScreen" ||
        (e.metaKey && e.shiftKey && ["3", "4", "5", "s"].includes(k)) ||
        (e.ctrlKey && e.shiftKey && k === "s") ||
        (e.ctrlKey && ["p", "s"].includes(k));
      if (screenshotCombo) {
        hide();
        navigator.clipboard?.writeText("").catch(() => {});
        showSoon(4000);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    window.addEventListener("beforeprint", hide);
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("beforeprint", hide);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
    };
  }, []);

  const watermark = useMemo(() => {
    const label = `${profile?.displayName ?? "user"} · ${(user?.uid ?? "").slice(0, 8)}`.replace(/[<>&"']/g, "");
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='260' height='140'><text x='10' y='80' font-size='14' font-family='sans-serif' fill='white' fill-opacity='0.07' transform='rotate(-25 130 70)'>${label}</text></svg>`;
    return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
  }, [user?.uid, profile?.displayName]);

  const block = (e: React.SyntheticEvent) => {
    // Разрешаем копировать только раскрытые пароли/коды (data-allow-copy).
    const target = e.target as HTMLElement | null;
    if (target?.closest?.("[data-allow-copy]")) return;
    const sel = window.getSelection()?.anchorNode?.parentElement;
    if (sel?.closest?.("[data-allow-copy]")) return;
    e.preventDefault();
  };

  return (
    <div
      className="chat-private relative h-full"
      onContextMenu={block}
      onCopy={block}
      onCut={block}
      onDragStart={block}
      style={{ WebkitTouchCallout: "none" }}
    >
      <div
        className="h-full"
        style={{ filter: hidden ? "blur(20px) brightness(0.5)" : undefined, pointerEvents: hidden ? "none" : undefined, transition: "filter 80ms" }}
        aria-hidden={hidden}
      >
        {children}
      </div>
      <div className="pointer-events-none absolute inset-0 z-20" style={{ backgroundImage: watermark }} />
      {hidden && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-2 text-white/70 text-sm">
          <EyeOff size={26} />
          Чат скрыт — вернись на вкладку
        </div>
      )}
    </div>
  );
}
