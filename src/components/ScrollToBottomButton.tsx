"use client";

import { RefObject, useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

const NEAR_BOTTOM_PX = 120;

/**
 * Поведение прокрутки чата как в Telegram:
 *  - при первой загрузке сразу показывает последние сообщения;
 *  - новые сообщения прокручивают вниз ТОЛЬКО если человек и так внизу — если он листает историю,
 *    его не выдёргивает, а на кнопке-стрелке появляется счётчик новых;
 *  - кнопка "вниз" видна, пока чат прокручен вверх.
 * Использование: const s = useChatScroll(ref, messages.length, extraDep); <div ref={ref} onScroll={s.onScroll}> ... <ScrollToBottomButton {...s.button} />
 */
export function useChatScroll(ref: RefObject<HTMLDivElement>, messagesLength: number, extraDep?: unknown) {
  const [atBottom, setAtBottom] = useState(true);
  const [unread, setUnread] = useState(0);
  const atBottomRef = useRef(true);
  const prevLen = useRef(0);
  const initialized = useRef(false);

  const scrollToBottom = useCallback(
    (smooth = true) => {
      const el = ref.current;
      if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
    },
    [ref]
  );

  const onScroll = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
    atBottomRef.current = near;
    setAtBottom(near);
    if (near) setUnread(0);
  }, [ref]);

  useEffect(() => {
    if (!initialized.current) {
      if (messagesLength > 0) {
        initialized.current = true;
        prevLen.current = messagesLength;
        scrollToBottom(false);
      }
      return;
    }
    const added = messagesLength - prevLen.current;
    prevLen.current = messagesLength;
    if (atBottomRef.current) scrollToBottom(true);
    else if (added > 0) setUnread((u) => u + added);
  }, [messagesLength, extraDep, scrollToBottom]);

  return {
    onScroll,
    button: { show: !atBottom, unread, onClick: () => scrollToBottom(true) },
  };
}

/** Круглая стрелка "вниз" в правом нижнем углу чата (над полем ввода), со счётчиком новых сообщений. */
export function ScrollToBottomButton({ show, unread, onClick }: { show: boolean; unread: number; onClick: () => void }) {
  if (!show) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Вниз, к последним сообщениям"
      className="absolute right-3 bottom-20 z-10 w-10 h-10 rounded-full bg-surface border border-white/10 shadow-card flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors"
    >
      <ChevronDown size={20} />
      {unread > 0 && (
        <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-accent text-black text-[10px] font-bold flex items-center justify-center">
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </button>
  );
}
