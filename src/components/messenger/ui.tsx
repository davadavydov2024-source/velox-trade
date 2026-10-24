"use client";

import { ReactNode } from "react";
import { X } from "lucide-react";
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
