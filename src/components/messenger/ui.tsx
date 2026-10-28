"use client";

import { ReactNode, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BadgeCheck, ChevronLeft, X } from "lucide-react";
import { gradientFor, initials } from "./util";

export function Avatar({
  src,
  name,
  seed,
  size = 48,
  online,
  ring,
  children,
}: {
  src?: string | null;
  name: string;
  seed?: string;
  size?: number;
  online?: boolean;
  ring?: "unseen" | "seen";
  children?: ReactNode;
}) {
  const [bad, setBad] = useState(false);
  const [c1, c2] = gradientFor(seed ?? name);
  const inner = (
    <div
      className="relative rounded-full overflow-hidden flex items-center justify-center text-white font-semibold shrink-0 select-none"
      style={{ width: size, height: size, background: src && !bad ? "var(--vc-surface2)" : `linear-gradient(135deg, ${c1}, ${c2})`, fontSize: size * 0.38 }}
    >
      {src && !bad ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="w-full h-full object-cover" onError={() => setBad(true)} draggable={false} />
      ) : (
        children ?? initials(name)
      )}
    </div>
  );
  const box = ring ? size + 10 : size;
  return (
    <div className="relative shrink-0" style={{ width: box, height: box }}>
      {ring ? (
        <>
          {/* градиентное кольцо → зазор цвета фона → аватар: все три слоя строго концентрические */}
          <span className={`vc-story-ring ${ring === "seen" ? "seen" : ""} absolute inset-0 rounded-full`} />
          <span className="absolute rounded-full" style={{ inset: 3, background: "var(--vc-bg)" }} />
          <span className="absolute" style={{ inset: 5 }}>{inner}</span>
        </>
      ) : (
        inner
      )}
      {online && (
        <span
          className="absolute rounded-full"
          style={{ width: size * 0.26, height: size * 0.26, right: ring ? 3 : 0, bottom: ring ? 3 : 0, background: "#34c759", border: "2.5px solid var(--vc-bg)" }}
        />
      )}
    </div>
  );
}

export function VerifiedBadge({ size = 15 }: { size?: number }) {
  return <BadgeCheck size={size} className="shrink-0" style={{ color: "var(--vc-accent)" }} />;
}

/** Точка монтирования для шторок и меню — внутри .vc-root, чтобы работали CSS-переменные темы. */
function usePortalTarget(): HTMLElement | null {
  const [el, setEl] = useState<HTMLElement | null>(null);
  useEffect(() => setEl(document.getElementById("vc-root")), []);
  return el;
}

export function Sheet({
  open,
  onClose,
  title,
  children,
  full,
  zIndex = 50,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  full?: boolean;
  zIndex?: number;
}) {
  const target = usePortalTarget();
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startY = useRef(0);
  const cb = useRef(onClose);
  cb.current = onClose;

  // Esc закрывает верхнюю шторку
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        cb.current();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open]);

  useEffect(() => {
    if (!open) {
      setDragY(0);
      setDragging(false);
    }
  }, [open]);

  if (!open || !target) return null;

  // «Потяни вниз, чтобы закрыть» — за ручку и шапку шторки (содержимое прокручивается как обычно)
  const onDown = (e: React.PointerEvent) => {
    startY.current = e.clientY;
    setDragging(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!dragging) return;
    setDragY(Math.max(0, e.clientY - startY.current));
  };
  const onUp = () => {
    if (!dragging) return;
    setDragging(false);
    if (dragY > 90) onClose();
    else setDragY(0);
  };

  return createPortal(
    <div className="absolute inset-0 flex flex-col justify-end vc-fade" style={{ zIndex, background: `rgba(0,0,0,${Math.max(0.15, 0.55 - dragY / 600)})` }} onClick={onClose}>
      <div
        className="vc-sheet vc-safe-bottom flex flex-col relative"
        style={{
          background: "var(--vc-surface)",
          borderRadius: "22px 22px 0 0",
          maxHeight: full ? "94%" : "86%",
          height: full ? "94%" : undefined,
          transform: dragY ? `translateY(${dragY}px)` : undefined,
          transition: dragging ? "none" : "transform 0.2s ease",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 touch-none select-none cursor-grab" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
          <div className="mx-auto mt-2 mb-1 h-1 w-9 rounded-full" style={{ background: "var(--vc-muted)", opacity: 0.5 }} />
          <div className="flex items-center justify-between px-5 pt-1 pb-2 min-h-[40px]">
            <p className="font-semibold text-[17px] truncate pr-3">{title}</p>
            {/* крестик есть у каждой шторки (раньше без заголовка закрыть можно было только нажатием мимо) */}
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
              style={{ background: "var(--vc-surface2)", color: "var(--vc-muted)" }}
              aria-label="Закрыть"
            >
              <X size={18} />
            </button>
          </div>
        </div>
        <div className="vc-scroll flex-1 min-h-0">{children}</div>
      </div>
    </div>,
    target
  );
}

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  danger?: boolean;
  onPress: () => void;
  hidden?: boolean;
}

export function MenuList({ items, onDone }: { items: MenuItem[]; onDone: () => void }) {
  return (
    <div className="pb-3">
      {items
        .filter((i) => !i.hidden)
        .map((item) => (
          <button
            key={item.label}
            onClick={() => {
              onDone();
              item.onPress();
            }}
            className="w-full flex items-center gap-3.5 px-5 py-3.5 text-left active:bg-white/5"
            style={{ color: item.danger ? "var(--vc-danger)" : undefined }}
          >
            <span className="w-6 flex justify-center opacity-80">{item.icon}</span>
            <span className="text-[16px]">{item.label}</span>
          </button>
        ))}
    </div>
  );
}

export function Switch({ on, onChange, disabled }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className="relative shrink-0 rounded-full transition-colors disabled:opacity-40"
      style={{ width: 50, height: 30, background: on ? "#34c759" : "var(--vc-surface2)" }}
    >
      <span className="absolute top-[3px] left-[3px] rounded-full bg-white transition-transform shadow" style={{ width: 24, height: 24, transform: on ? "translateX(20px)" : "none" }} />
    </button>
  );
}

export function IconBox({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span className="vc-icon-box" style={{ background: color }}>
      {children}
    </span>
  );
}

export function Spinner({ size = 20 }: { size?: number }) {
  return (
    <span
      className="inline-block rounded-full animate-spin"
      style={{ width: size, height: size, border: "2.5px solid var(--vc-line)", borderTopColor: "var(--vc-accent)" }}
    />
  );
}

export function PageHeader({ title, onBack, right }: { title: string; onBack?: () => void; right?: ReactNode }) {
  return (
    <div className="vc-safe-top shrink-0" style={{ background: "var(--vc-bg)" }}>
      <div className="h-12 px-2 flex items-center relative">
        {onBack ? (
          <button onClick={onBack} className="flex items-center gap-0.5 px-2 py-2" style={{ color: "var(--vc-accent)" }}>
            <ChevronLeft size={24} /> <span className="text-[16px]">Назад</span>
          </button>
        ) : (
          <span className="w-16" />
        )}
        <p className="absolute left-1/2 -translate-x-1/2 font-semibold text-[17px] pointer-events-none">{title}</p>
        <div className="ml-auto pr-2">{right}</div>
      </div>
    </div>
  );
}

export function Section({ children, title, footer }: { children: ReactNode; title?: string; footer?: string }) {
  return (
    <div className="px-4 mb-5">
      {title && <p className="vc-muted text-[13px] uppercase tracking-wide px-3 mb-1.5">{title}</p>}
      <div className="vc-card">{children}</div>
      {footer && <p className="vc-muted text-[13px] px-3 mt-1.5">{footer}</p>}
    </div>
  );
}

/** Закрытие по нажатию вне элемента. */
export function useClickOutside(ref: React.RefObject<HTMLElement>, onOutside: () => void, active: boolean) {
  const cb = useRef(onOutside);
  cb.current = onOutside;
  useEffect(() => {
    if (!active) return;
    const h = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) cb.current();
    };
    document.addEventListener("mousedown", h);
    document.addEventListener("touchstart", h);
    return () => {
      document.removeEventListener("mousedown", h);
      document.removeEventListener("touchstart", h);
    };
  }, [ref, active]);
}
