"use client";

import { ReactNode } from "react";
import { ArrowLeft, Loader2, X } from "lucide-react";
import type { MessengerAccount, MessengerChat } from "@/lib/messenger/types";
import { isPremium } from "@/lib/messenger/premium";

export type Accs = Record<string, MessengerAccount | undefined>;
export const cx = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(" ");

const COLORS = ["#e17076", "#faa774", "#a695e7", "#7bc862", "#6ec9cb", "#65aadd", "#ee7aae"];

export function Avatar({ name, src, size = 48, className }: { name: string; src?: string | null; size?: number; className?: string }) {
  const ok = !!src && (src.startsWith("https://") || src.startsWith("/"));
  if (ok) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src!} alt="" width={size} height={size} style={{ width: size, height: size }} className={cx("rounded-full object-cover shrink-0 bg-black/30", className)} />;
  }
  const c = COLORS[Array.from(name || "?").reduce((s, ch) => s + ch.charCodeAt(0), 0) % COLORS.length];
  return (
    <div style={{ width: size, height: size, background: `linear-gradient(135deg, ${c}, ${c}aa)`, fontSize: size * 0.4 }} className={cx("rounded-full flex items-center justify-center font-bold text-white shrink-0", className)}>
      {(name || "?").trim().charAt(0).toUpperCase()}
    </div>
  );
}

const pad = (n: number) => String(n).padStart(2, "0");
export const fmtClock = (ts: number) => { const d = new Date(ts); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
export function fmtListTime(ts?: number) {
  if (!ts) return "";
  const d = new Date(ts), now = new Date();
  if (d.toDateString() === now.toDateString()) return fmtClock(ts);
  if (now.getTime() - ts < 6 * 86400_000) return ["вс", "пн", "вт", "ср", "чт", "пт", "сб"][d.getDay()];
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${String(d.getFullYear()).slice(2)}`;
}
export function fmtDay(ts: number) {
  const d = new Date(ts), now = new Date();
  if (d.toDateString() === now.toDateString()) return "Сегодня";
  if (now.getTime() - ts < 2 * 86400_000 && new Date(now.getTime() - 86400_000).toDateString() === d.toDateString()) return "Вчера";
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long", ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}) });
}
export function lastSeenText(a?: MessengerAccount): string {
  if (!a) return "";
  if (a.uid === "miligram") return "служебный аккаунт";
  const diff = Date.now() - (a.lastSeenAt ?? 0);
  if (a.showLastSeen === false) return "был(а) недавно";
  if (diff < 2 * 60_000) return "в сети";
  if (diff < 3600_000) return `был(а) ${Math.floor(diff / 60_000)} мин. назад`;
  if (new Date(a.lastSeenAt).toDateString() === new Date().toDateString()) return `был(а) в ${fmtClock(a.lastSeenAt)}`;
  return `был(а) ${fmtListTime(a.lastSeenAt)}`;
}

export function chatMeta(chat: MessengerChat, uid: string, accs: Accs) {
  if (chat.type === "dm") {
    const other = chat.members.find((m) => m !== uid);
    const a = other ? accs[other] : undefined;
    return { title: other ? a?.displayName ?? "…" : "Избранное", photoURL: other ? a?.photoURL ?? null : null, verified: !!a?.verified, premium: isPremium(a), other, account: a, self: !other };
  }
  return { title: chat.title ?? "Чат", photoURL: chat.photoURL ?? null, verified: false, premium: false, other: undefined, account: undefined, self: false };
}

export function UnreadBadge({ n, muted, mention }: { n: number; muted?: boolean; mention?: boolean }) {
  if (n <= 0 && !mention) return null;
  return <span className={cx("min-w-[22px] h-[22px] px-1.5 rounded-full text-[12px] font-semibold flex items-center justify-center", muted ? "bg-white/20 text-white" : "bg-accent text-black")}>{mention && n <= 0 ? "@" : n > 99 ? "99+" : n}</span>;
}

/** Нижняя шторка (на телефоне) / окно по центру (на широком экране). */
export function Sheet({ onClose, title, children }: { onClose: () => void; title?: string; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center bg-black/60" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full sm:max-w-md bg-surface rounded-t-[28px] sm:rounded-[24px] max-h-[88dvh] overflow-y-auto" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="sm:hidden mx-auto mt-2 mb-1 h-1 w-10 rounded-full bg-white/20" />
        {title && (
          <div className="flex items-center justify-between px-5 pt-3 pb-1">
            <p className="font-bold">{title}</p>
            <button onClick={onClose} className="text-white/50 hover:text-white"><X size={20} /></button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

export function Splash() {
  return (
    <div className="h-full flex items-center justify-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/miligram/icon-192.png" alt="MiliGram" className="w-20 h-20 rounded-[22px] animate-pulse" />
    </div>
  );
}

// ---- Совместимость с файлами второй сессии (Onboarding, SettingsPane): те же имена, что были в её ui.tsx. Пропсы намеренно гибкие. ----

export function Spinner({ size = 20, className }: { size?: number; className?: string }) {
  return <Loader2 size={size} className={cx("animate-spin", className)} />;
}

export function IconBox({ children, color, bg, size = 32, className }: { children?: ReactNode; color?: string; bg?: string; size?: number; className?: string; [k: string]: any }) {
  return (
    <span style={{ width: size, height: size, background: bg ?? color ?? "#64748b" }} className={cx("rounded-[9px] flex items-center justify-center text-white shrink-0", className)}>
      {children}
    </span>
  );
}

export function PageHeader({ title, onBack, right, children, className }: { title?: ReactNode; onBack?: () => void; right?: ReactNode; children?: ReactNode; className?: string; [k: string]: any }) {
  return (
    <header className={cx("shrink-0 flex items-center gap-2 px-2 py-2 border-b border-border bg-surface/80", className)}>
      {onBack && <button onClick={onBack} className="w-9 h-9 flex items-center justify-center text-white/70"><ArrowLeft size={22} /></button>}
      <div className="flex-1 min-w-0 font-semibold truncate px-1">{title ?? children}</div>
      {right}
    </header>
  );
}

export function Section({ title, footer, children, className }: { title?: ReactNode; footer?: ReactNode; children?: ReactNode; className?: string; [k: string]: any }) {
  return (
    <section className={cx("mx-3 mb-3", className)}>
      {title && <h2 className="text-xs uppercase tracking-wide text-white/40 px-2 pb-1.5">{title}</h2>}
      <div className="rounded-[20px] bg-surface overflow-hidden">{children}</div>
      {footer && <p className="text-[11px] text-white/30 px-2 pt-1.5">{footer}</p>}
    </section>
  );
}

export function Switch({ checked, value, on, onChange, onToggle, disabled }: { checked?: boolean; value?: boolean; on?: boolean; onChange?: (v: boolean) => void; onToggle?: (v: boolean) => void; disabled?: boolean; [k: string]: any }) {
  const cur = !!(checked ?? value ?? on);
  return (
    <button type="button" role="switch" aria-checked={cur} disabled={disabled} onClick={() => { onChange?.(!cur); onToggle?.(!cur); }}
      className={cx("w-11 h-6 rounded-full relative transition-colors shrink-0 disabled:opacity-50", cur ? "bg-accent" : "bg-white/20")}>
      <span className={cx("absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all", cur ? "left-[22px]" : "left-0.5")} />
    </button>
  );
}
