"use client";

import { ReactNode, useState } from "react";
import { X } from "lucide-react";
import type { MessengerAccount, MessengerChat } from "@/lib/messenger/types";
import { isPremium } from "@/lib/messenger/premium";

/** Общие мелкие помощники для экранов в стиле сайта (Tailwind-токены bg/surface/accent). */
export const cx = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(" ");

export type Accs = Record<string, MessengerAccount | undefined>;

const GRADS = ["from-orange-400 to-rose-500", "from-sky-400 to-blue-500", "from-emerald-400 to-teal-500", "from-fuchsia-400 to-purple-500", "from-amber-300 to-orange-500", "from-pink-400 to-rose-500"];

export function Avatar({ name, src, size = 40, className }: { name: string; src?: string | null; size?: number; className?: string }) {
  const [bad, setBad] = useState(false);
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  const initials = name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
  return (
    <span className={cx("relative shrink-0 rounded-full overflow-hidden inline-flex items-center justify-center text-white font-semibold select-none bg-gradient-to-br", GRADS[h % GRADS.length], className)} style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {src && !bad ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="w-full h-full object-cover" onError={() => setBad(true)} draggable={false} />
      ) : initials}
    </span>
  );
}

export function Sheet({ onClose, title, children }: { onClose: () => void; title?: string; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-[9500] bg-black/60 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="w-full max-w-md max-h-[88vh] flex flex-col rounded-t-[22px] sm:rounded-[22px] bg-surface border border-white/5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pt-4 pb-2 shrink-0">
          <p className="font-semibold text-lg">{title}</p>
          <button onClick={onClose} className="text-white/50" aria-label="Закрыть"><X size={20} /></button>
        </div>
        <div className="overflow-y-auto overscroll-contain">{children}</div>
      </div>
    </div>
  );
}

export function UnreadBadge({ n, muted, mention }: { n: number; muted?: boolean; mention?: boolean }) {
  return (
    <span className={cx("min-w-[22px] h-[22px] px-1.5 rounded-full text-xs font-bold inline-flex items-center justify-center shrink-0", muted ? "bg-white/20 text-white/80" : "bg-accent text-black")}>
      {mention ? "@" : n > 99 ? "99+" : n}
    </span>
  );
}

export function fmtListTime(ts: number): string {
  if (!ts) return "";
  const d = new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  if (now.getTime() - ts < 6 * 86_400_000) return d.toLocaleDateString("ru-RU", { weekday: "short" });
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

/** Название и аватар чата: личный — собеседник (или «Избранное»), группа/канал — их название. */
export function chatMeta(chat: MessengerChat, uid: string, accs: Accs): { title: string; photoURL: string | null; verified: boolean; premium: boolean } {
  if (chat.service) return { title: chat.title || "MiliGram Push", photoURL: chat.photoURL ?? null, verified: true, premium: false };
  if (chat.type !== "dm") return { title: chat.title || (chat.type === "channel" ? "Канал" : "Группа"), photoURL: chat.photoURL ?? null, verified: false, premium: false };
  const other = chat.members.find((m) => m !== uid);
  if (!other) return { title: "Избранное", photoURL: null, verified: false, premium: false };
  const a = accs[other];
  return { title: a?.displayName ?? "Пользователь", photoURL: a?.photoURL ?? null, verified: !!a?.verified, premium: isPremium(a) };
}
