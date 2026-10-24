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
      style={{ width: size, height: size, background: src && !bad ? "var(--mx-surface2)" : `linear-gradient(135deg, ${c1}, ${c2})`, fontSize: size * 0.38 }}
    >
      {src && !bad ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="w-full h-full object-cover" onError={() => setBad(true)} draggable={false} />
      ) : (
        children ?? initials(name)
      )}
    </div>
  );
  return (
    <div className="relative shrink-0" style={{ width: ring ? size + 8 : size, height: ring ? size + 8 : size }}>
      {ring ? (
        <div className={`mx-story-ring ${ring === "seen" ? "seen" : ""}`}>
          <div className="rounded-full p-[2px]" style={{ background: "var(--mx-bg)" }}>{inner}</div>
        </div>
      ) : (
        inner
      )}
      {online && (
        <span
          className="absolute rounded-full"
          style={{ width: size * 0.26, height: size * 0.26, right: ring ? 2 : 0, bottom: ring ? 2 : 0, background: "#34c759", border: "2.5px solid var(--mx-bg)" }}
        />
      )}
    </div>
  );
}

export function VerifiedBadge({ size = 15 }: { size?: number }) {
  return <BadgeCheck size={size} className="shrink-0" style={{ color: "var(--mx-accent)" }} />;
}

/** Точка монтирования для шторок и меню — внутри .mx-root, чтобы работали CSS-переменные темы. */
function usePortalTarget(): HTMLElement | null {
  const [el, setEl] = useState<HTMLElement | null>(null);
  useEffect(() => setEl(document.getElementById("mx-root")), []);
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
  if (!open || !target) return null;
  return createPortal(
    <div className="absolute inset-0 flex flex-col justify-end mx-fade" style={{ zIndex, background: "rgba(0,0,0,0.55)" }} onClick={onClose}>
      <div
        className="mx-sheet mx-safe-bottom flex flex-col"
        style={{ background: "var(--mx-surface)", borderRadius: "22px 22px 0 0", maxHeight: full ? "94%" : "86%", height: full ? "94%" : undefined }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mt-2 mb-1 h-1 w-9 rounded-full shrink-0" style={{ background: "var(--mx-line)" }} />
        {title && (
          <div className="flex items-center justify-between px-5 pt-2 pb-2 shrink-0">
            <p className="font-semibold text-[17px]">{title}</p>
            <button onClick={onClose} className="mx-muted p-1" aria-label="Закрыть">
              <X size={20} />
            </button>
          </div>
        )}
        <div className="mx-scroll flex-1 min-h-0">{children}</div>
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
            style={{ color: item.danger ? "var(--mx-danger)" : undefined }}
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
      style={{ width: 50, height: 30, background: on ? "#34c759" : "var(--mx-surface2)" }}
    >
      <span className="absolute top-[3px] left-[3px] rounded-full bg-white transition-transform shadow" style={{ width: 24, height: 24, transform: on ? "translateX(20px)" : "none" }} />
    </button>
  );
}

export function IconBox({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span className="mx-icon-box" style={{ background: color }}>
      {children}
    </span>
  );
}

export function Spinner({ size = 20 }: { size?: number }) {
  return (
    <span
      className="inline-block rounded-full animate-spin"
      style={{ width: size, height: size, border: "2.5px solid var(--mx-line)", borderTopColor: "var(--mx-accent)" }}
    />
  );
}

export function PageHeader({ title, onBack, right }: { title: string; onBack?: () => void; right?: ReactNode }) {
  return (
    <div className="mx-safe-top shrink-0" style={{ background: "var(--mx-bg)" }}>
      <div className="h-12 px-2 flex items-center relative">
        {onBack ? (
          <button onClick={onBack} className="flex items-center gap-0.5 px-2 py-2" style={{ color: "var(--mx-accent)" }}>
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
      {title && <p className="mx-muted text-[13px] uppercase tracking-wide px-3 mb-1.5">{title}</p>}
      <div className="mx-card">{children}</div>
      {footer && <p className="mx-muted text-[13px] px-3 mt-1.5">{footer}</p>}
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
