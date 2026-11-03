"use client";

import { ReactNode, useEffect, useState } from "react";
import { NFT_SYMBOL_CHARS, backdropOf, symbolOf } from "@/lib/messenger/nft";
import type { GiftView } from "@/lib/messenger/gifts";
import { mApi } from "./api";
import { isPremium } from "@/lib/messenger/premium";
import type { MAccount } from "./mtypes";
import { Avatar } from "./ui";

/** Плоские цвета шапки профиля, как «цвет профиля» в Telegram: выбираются по uid, чтобы у человека он всегда был один. */
const PROFILE_COLORS = ["#c75b4a", "#cf8a3c", "#8a63c4", "#4f9a62", "#3d93a8", "#4a86c8", "#bf5f86"];
export function profileColor(seed: string): string {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PROFILE_COLORS[h % PROFILE_COLORS.length];
}

/** Узор из символов подарка кольцами вокруг аватарки — так Telegram украшает профиль с коллекционным подарком в статусе. */
function Pattern({ ch }: { ch: string }) {
  const rings: [number, number, number, number][] = [[62, 6, 22, 0.22], [104, 10, 20, 0.15], [146, 14, 18, 0.1], [190, 18, 16, 0.07]];
  const items: ReactNode[] = [];
  rings.forEach(([r, n, size, op], ri) => {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + ri * 0.35;
      const x = 200 + Math.cos(a) * r * 1.55;
      const y = 96 + Math.sin(a) * r * 0.78;
      items.push(
        <text key={`${ri}-${i}`} x={x} y={y} fontSize={size} textAnchor="middle" dominantBaseline="central" fill="#fff" opacity={op} transform={`rotate(${((i * 47 + ri * 20) % 60) - 30} ${x} ${y})`}>{ch}</text>
      );
    }
  });
  return <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 400 220" preserveAspectRatio="xMidYMid slice" aria-hidden>{items}</svg>;
}

/** Подарки человека (для подарков-спутников вокруг аватарки и значка «коллекционер»). null — ещё грузятся. */
export function useProfileGifts(uid?: string | null): GiftView[] | null {
  const [list, setList] = useState<GiftView[] | null>(null);
  useEffect(() => {
    if (!uid) { setList(null); return; }
    let dead = false;
    mApi<{ gifts: GiftView[] }>(`gifts?uid=${encodeURIComponent(uid)}`).then((d) => { if (!dead) setList(d.gifts); }).catch(() => { if (!dead) setList([]); });
    return () => { dead = true; };
  }, [uid]);
  return list;
}

/** Круглая кнопка в углу шапки профиля (изменить, закрыть). */
export function ProfileRoundBtn({ icon, onClick, label }: { icon: ReactNode; onClick: () => void; label: string }) {
  return <button onClick={onClick} aria-label={label} className="w-9 h-9 rounded-full flex items-center justify-center active:opacity-70" style={{ background: "rgba(0,0,0,0.22)", color: "#fff" }}>{icon}</button>;
}

/**
 * Шапка профиля как в Telegram: плоский сплошной цвет профиля (или цвет NFT-статуса), по центру аватарка,
 * ниже имя со значками, строка «в сети» и подзаголовок. Без баннеров, свечения и анимаций.
 */
export function ProfileHeader({
  seed, name, photo, account, subtitle, statusPill, badges, avatarSize = 96, avatarFallback, onAvatarClick, avatarBusy, avatarOverlay, topRight, topLeft,
}: {
  seed: string; name: string; photo?: string | null; account?: MAccount | null; subtitle?: ReactNode; statusPill?: ReactNode; badges?: ReactNode; avatarSize?: number;
  avatarFallback?: ReactNode; onAvatarClick?: () => void; avatarBusy?: boolean; avatarOverlay?: ReactNode; topRight?: ReactNode; topLeft?: ReactNode; orbit?: GiftView[];
}) {
  const st = account?.status;
  const nft = st && st.kind === "nft" && isPremium(account) ? st.nft : null;
  const bd = nft ? backdropOf(nft.backdrop) : null;
  const base = bd ? bd.colors[0] : profileColor(seed);
  const av = <Avatar src={photo ?? null} name={name} seed={seed} size={avatarSize}>{avatarFallback}</Avatar>;
  return (
    <div className="relative overflow-hidden" style={{ background: base, color: "#fff" }}>
      {nft && <div className="absolute inset-x-0 top-0 pointer-events-none" style={{ height: 220, opacity: 0.5 }}><Pattern ch={NFT_SYMBOL_CHARS[symbolOf(nft.symbol).name] ?? "✦"} /></div>}
      {topLeft && <div className="absolute left-3 top-3 z-10">{topLeft}</div>}
      {topRight && <div className="absolute right-3 top-3 z-10 flex gap-2">{topRight}</div>}
      <div className="relative z-[1] flex flex-col items-center px-5 pt-12 pb-5">
        {onAvatarClick ? (
          <button onClick={onAvatarClick} disabled={avatarBusy} className="relative rounded-full" aria-label="Сменить фото">{av}{avatarOverlay}</button>
        ) : (
          <div className="relative">{av}{avatarOverlay}</div>
        )}
        <p className="mt-3 text-[21px] font-semibold flex items-center justify-center gap-1.5 text-center leading-tight">{name}{badges}</p>
        {statusPill && <p className="text-[14px] mt-1 text-center" style={{ opacity: 0.8 }}>{statusPill}</p>}
        {subtitle && <p className="text-[14px] mt-0.5 text-center" style={{ opacity: 0.8 }}>{subtitle}</p>}
      </div>
    </div>
  );
}

/** Строка данных профиля как в Telegram: сверху значение, ниже серая подпись. */
export function InfoRow({ value, label, onClick, accent, right }: { value: ReactNode; label: string; onClick?: () => void; accent?: boolean; right?: ReactNode }) {
  const inner = (
    <>
      <span className="block min-w-0 flex-1 text-left">
        <span className="block text-[16px] break-words whitespace-pre-wrap" style={{ color: accent ? "var(--mx-accent)" : undefined }}>{value}</span>
        <span className="block text-[13px] mx-muted mt-0.5">{label}</span>
      </span>
      {right}
    </>
  );
  const cls = "w-full flex items-center gap-3 px-4 py-2.5 text-left";
  return onClick ? <button onClick={onClick} className={cls}>{inner}</button> : <div className={cls}>{inner}</div>;
}

/** Плитка действия под шапкой профиля (Написать, Звук, Подарок, Поиск…). */
export function ProfileTile({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex-1 min-w-0 flex flex-col items-center gap-1 rounded-xl py-2.5 active:opacity-70 transition-opacity" style={{ background: "var(--mx-surface)", color: "var(--mx-accent)" }}>
      {icon}
      <span className="text-[12.5px] truncate max-w-full px-1" style={{ color: "var(--mx-text)" }}>{label}</span>
    </button>
  );
}

/** Вкладки профиля: плоские, активная с акцентной линией снизу. */
export function ProfileTabs<T extends string>({ tabs, value, onChange, labels }: { tabs: T[]; value: T; onChange: (t: T) => void; labels: Record<T, string> }) {
  return (
    <div className="flex overflow-x-auto mx-noscrollbar px-2 mb-2" style={{ borderBottom: "1px solid var(--mx-line)" }}>
      {tabs.map((t) => {
        const on = value === t;
        return (
          <button key={t} onClick={() => onChange(t)} className="relative shrink-0 px-3.5 h-11 text-[15px] font-medium whitespace-nowrap" style={{ color: on ? "var(--mx-accent)" : "var(--mx-muted)" }}>
            {labels[t]}
            {on && <span className="absolute left-2 right-2 bottom-[-1px] h-[2px] rounded-full" style={{ background: "var(--mx-accent)" }} />}
          </button>
        );
      })}
    </div>
  );
}

/** Значки профиля — считаются по данным аккаунта: верификация, Premium, ранний пользователь, редкий номер, коллекционер NFT. */
export function profileBadges(acc: MAccount | null | undefined, nftCount: number, numberRare: boolean): { key: string; label: string; color: string; icon: "check" | "star" | "crown" | "spark" | "hash" | "gem" }[] {
  if (!acc) return [];
  const out: { key: string; label: string; color: string; icon: "check" | "star" | "crown" | "spark" | "hash" | "gem" }[] = [];
  if (acc.verified) out.push({ key: "verified", label: "Подтверждённый аккаунт", color: "#3b82f6", icon: "check" });
  if (isPremium(acc)) out.push({ key: "premium", label: "Premium", color: "#f5a623", icon: "star" });
  if (acc.plusUntil && acc.plusUntil > Date.now()) out.push({ key: "plus", label: "Premium Plus", color: "#9b6bff", icon: "crown" });
  if (acc.numId && acc.numId <= 100_999) out.push({ key: "early", label: "Один из первых 1000 пользователей", color: "#34c759", icon: "spark" });
  if (numberRare) out.push({ key: "number", label: "Редкий номер", color: "#ff5ca8", icon: "hash" });
  if (nftCount >= 3) out.push({ key: "collector", label: "Коллекционер NFT", color: "#22b8cf", icon: "gem" });
  return out;
}

/** Компактное число: 1100 → «1.1к». */
export function fmtCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}м`;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}к`;
  return String(n);
}
