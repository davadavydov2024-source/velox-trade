"use client";

import { ReactNode, useRef } from "react";

export interface SwipeAction {
  label: string;
  icon: ReactNode;
  color: string;
  onPress: () => void;
}

const ACTION_W = 76;

/**
 * Строка со свайпами как в Telegram iOS: влево — набор действий (закрепить / без звука / архив / удалить),
 * вправо — одно быстрое действие. Долгое нажатие и правая кнопка мыши — контекстное меню.
 */
export function SwipeRow({
  children,
  leftActions = [],
  rightAction,
  onClick,
  onLongPress,
  disabled,
}: {
  children: ReactNode;
  leftActions?: SwipeAction[];
  rightAction?: SwipeAction;
  onClick?: () => void;
  onLongPress?: () => void;
  disabled?: boolean;
}) {
  const innerRef = useRef<HTMLDivElement>(null);
  const st = useRef({ x0: 0, y0: 0, base: 0, cur: 0, axis: "" as "" | "h" | "v", moved: false, timer: 0 as any, open: 0 });

  const maxLeft = leftActions.length * ACTION_W;
  const maxRight = rightAction ? ACTION_W : 0;

  const setX = (x: number, animate: boolean) => {
    const el = innerRef.current;
    if (!el) return;
    el.style.transition = animate ? "transform 0.22s cubic-bezier(0.2,0.8,0.2,1)" : "none";
    el.style.transform = `translateX(${x}px)`;
    st.current.cur = x;
  };

  const onTouchStart = (e: React.TouchEvent) => {
    if (disabled) return;
    const t = e.touches[0];
    const s = st.current;
    s.x0 = t.clientX;
    s.y0 = t.clientY;
    s.base = s.cur;
    s.axis = "";
    s.moved = false;
    clearTimeout(s.timer);
    if (onLongPress) {
      s.timer = setTimeout(() => {
        if (!s.moved) {
          s.moved = true;
          navigator.vibrate?.(8);
          onLongPress();
        }
      }, 450);
    }
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (disabled) return;
    const s = st.current;
    const t = e.touches[0];
    const dx = t.clientX - s.x0;
    const dy = t.clientY - s.y0;
    if (!s.axis) {
      if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
        s.axis = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
        s.moved = true;
        clearTimeout(s.timer);
      }
    }
    if (s.axis !== "h") return;
    setX(Math.max(-maxLeft, Math.min(maxRight, s.base + dx)), false);
  };

  const onTouchEnd = () => {
    const s = st.current;
    clearTimeout(s.timer);
    if (s.axis !== "h") return;
    const x = s.cur;
    if (x < -maxLeft * 0.4) setX(-maxLeft, true);
    else if (x > maxRight * 0.6 && rightAction) {
      setX(0, true);
      rightAction.onPress();
    } else setX(0, true);
  };

  const handleClick = () => {
    const s = st.current;
    if (s.cur !== 0) return setX(0, true);
    if (s.moved) return;
    onClick?.();
  };

  const close = () => setX(0, true);

  return (
    <div className="mx-row" onContextMenu={(e) => { if (onLongPress) { e.preventDefault(); onLongPress(); } }}>
      {rightAction && (
        <div className="absolute inset-y-0 left-0 flex items-center justify-center text-white text-[12px] font-medium" style={{ width: ACTION_W, background: rightAction.color }}>
          <div className="flex flex-col items-center gap-1">{rightAction.icon}{rightAction.label}</div>
        </div>
      )}
      {leftActions.length > 0 && (
        <div className="absolute inset-y-0 right-0 flex">
          {leftActions.map((a) => (
            <button
              key={a.label}
              onClick={() => { close(); a.onPress(); }}
              className="flex flex-col items-center justify-center gap-1 text-white text-[12px] font-medium"
              style={{ width: ACTION_W, background: a.color }}
            >
              {a.icon}
              {a.label}
            </button>
          ))}
        </div>
      )}
      <div
        ref={innerRef}
        className="mx-row-inner"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
        onClick={handleClick}
      >
        {children}
      </div>
    </div>
  );
}
