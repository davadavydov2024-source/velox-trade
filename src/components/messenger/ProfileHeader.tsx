"use client";

import { ReactNode, useEffect, useState } from "react";
import { NFT_SYMBOL_CHARS, backdropOf, modelOf, symbolOf } from "@/lib/messenger/nft";
import { giftById, type GiftView } from "@/lib/messenger/gifts";
import { mApi } from "./api";
import { NftFigure, hasNftFigure } from "./NftFigures";
import { isPremium } from "@/lib/messenger/premium";
import type { MAccount } from "./mtypes";
import { Avatar } from "./ui";
import { AvatarFrame } from "./AvatarFrame";

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

/** Один подарок-спутник у аватарки: фигурка NFT без фона или эмодзи обычного подарка. */
function OrbitGift({ g, size }: { g: GiftView; size: number }) {
  const d = giftById(g.giftId);
  if (!d) return null;
  if (g.nft && hasNftFigure(d.id)) {
    const m = modelOf(g.nft.model);
    return (
      <svg viewBox="0 0 200 200" width={size} height={size} style={{ filter: "drop-shadow(0 3px 6px rgba(0,0,0,0.45))" }}>
        <g style={{ filter: `hue-rotate(${m.hue}deg) saturate(${m.sat}) brightness(${m.bright ?? 1})`, transform: m.flip ? "scaleX(-1)" : undefined, transformOrigin: "100px 0px", transformBox: "view-box" } as React.CSSProperties}><NftFigure id={d.id} /></g>
      </svg>
    );
  }
  return <span style={{ fontSize: size * 0.82, lineHeight: 1, filter: "drop-shadow(0 3px 6px rgba(0,0,0,0.45))" }}>{d.emoji}</span>;
}

/** Круглая тёмная кнопка в углу шапки профиля (изменить, закрыть). */
export function ProfileRoundBtn({ icon, onClick, label }: { icon: ReactNode; onClick: () => void; label: string }) {
  return <button onClick={onClick} aria-label={label} className="w-10 h-10 rounded-full flex items-center justify-center active:opacity-70" style={{ background: "rgba(255,255,255,0.14)", border: "1px solid rgba(255,255,255,0.12)", color: "#fff" }}>{icon}</button>;
}

const PROFILE_FONT = '"Manrope", ui-rounded, "SF Pro Rounded", "Segoe UI", system-ui, sans-serif';

/** Тёмная «стеклянная» карточка профиля (как в референсе): градиент от светлого серого сверху к почти чёрному, свой шрифт и свои цвета текста. */
export function ProfileShell({ children, black = false }: { children: ReactNode; black?: boolean }) {
  return (
    <div
      className="relative"
      style={{
        minHeight: "100%", color: "#fff", fontFamily: PROFILE_FONT,
        background: black ? "#000" : "linear-gradient(165deg, #3d3d44 0%, #27272d 32%, #17171b 68%, #101013 100%)",
        ["--mx-text" as string]: "#ffffff", ["--mx-muted" as string]: "#9e9ea9", ["--mx-surface" as string]: "rgba(255,255,255,0.07)",
        ["--mx-surface2" as string]: "rgba(255,255,255,0.11)", ["--mx-line" as string]: "rgba(255,255,255,0.1)",
      } as React.CSSProperties}
    >
      <style>{'@import url("https://fonts.googleapis.com/css2?family=Manrope:wght@500;600;700;800&display=swap");'}</style>
      {children}
    </div>
  );
}

/** Глянцевый круглый значок (самоцвет): радиальный блик + тень цвета значка. */
export function BadgeDot({ color, title, children }: { color: string; title: string; children: ReactNode }) {
  return (
    <span title={title} className="w-[30px] h-[30px] rounded-full flex items-center justify-center text-white shrink-0"
      style={{ background: `radial-gradient(circle at 32% 26%, rgba(255,255,255,0.6) 0%, ${color} 40%, color-mix(in srgb, ${color} 55%, #000) 100%)`, boxShadow: `0 0 0 1px rgba(255,255,255,0.2), 0 3px 9px ${color}66` }}>
      {children}
    </span>
  );
}

/** Чип-ссылка (как соцсети в профиле): тёмная пилюля с иконкой и названием сайта. */
export function LinkChip({ href, label, icon }: { href: string; label: string; icon: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-[13.5px] font-bold" style={{ background: "rgba(0,0,0,0.34)", border: "1px solid rgba(255,255,255,0.08)", color: "#fff" }}>
      <span style={{ color: "#5ac8fa" }}>{icon}</span><span className="truncate max-w-[180px]">{label}</span>
    </a>
  );
}

/** Строка с мелкой иконкой слева (дата регистрации, просмотры). */
export function InfoLine({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return <div className="flex items-center gap-2 px-5 py-1.5 text-[14px] mx-muted"><span className="shrink-0">{icon}</span><span>{children}</span></div>;
}

/**
 * Шапка профиля: тёмный фон с мягким свечением цвета профиля (или цветов NFT-статуса), либо баннер; крупная круглая аватарка,
 * вокруг неё парят закреплённые подарки; имя со значками и «пилюля» статуса.
 */
export function ProfileHeader({
  seed, name, photo, account, subtitle, statusPill, badges, avatarSize = 122, avatarFallback, onAvatarClick, avatarBusy, avatarOverlay, topRight, topLeft, orbit,
}: {
  seed: string; name: string; photo?: string | null; account?: MAccount | null; subtitle?: ReactNode; statusPill?: ReactNode; badges?: ReactNode; avatarSize?: number;
  avatarFallback?: ReactNode; onAvatarClick?: () => void; avatarBusy?: boolean; avatarOverlay?: ReactNode; topRight?: ReactNode; topLeft?: ReactNode; orbit?: GiftView[];
}) {
  const st = account?.status;
  const nft = st && st.kind === "nft" && isPremium(account) ? st.nft : null;
  const banner = account?.bannerURL ?? null;
  const bd = nft ? backdropOf(nft.backdrop) : null;
  const glow = bd ? bd.colors[0] : profileColor(seed);
  const av = <AvatarFrame frame={account?.frame} size={avatarSize}><span className="block rounded-full" style={{ boxShadow: account?.frame ? undefined : `0 0 0 3px rgba(255,255,255,0.14), 0 12px 44px ${glow}66` }}><Avatar src={photo ?? null} name={name} seed={seed} size={avatarSize}>{avatarFallback}</Avatar></span></AvatarFrame>;
  const items = (orbit ?? []).slice(0, 6);
  const box = avatarSize + 110; // размер «поля» вокруг аватарки под подарки-спутники
  const R = avatarSize / 2 + 36;
  return (
    <div className="relative overflow-hidden">
      <style>{"@keyframes mx-orbit-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}.mx-orbit-float{animation:mx-orbit-float 3.4s ease-in-out infinite}"}</style>
      {banner ? (
        <div className="relative" style={{ height: 176 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={banner} alt="" className="absolute inset-0 w-full h-full object-cover" draggable={false} />
          <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.15), var(--mx-bg))" }} />
        </div>
      ) : (
        <>
          <div className="absolute inset-x-0 top-0 pointer-events-none" style={{ height: 280, background: `radial-gradient(ellipse at 50% 0%, ${glow}59 0%, transparent 72%)` }} />
          {nft && <div className="absolute inset-x-0 top-0 pointer-events-none" style={{ height: 220, opacity: 0.55 }}><Pattern ch={NFT_SYMBOL_CHARS[symbolOf(nft.symbol).name] ?? "✦"} /></div>}
        </>
      )}
      {topLeft && <div className="absolute left-3 top-3 z-10">{topLeft}</div>}
      {topRight && <div className="absolute right-3 top-3 z-10 flex gap-2">{topRight}</div>}
      <div className="relative z-[1] flex flex-col items-center px-5 pb-4" style={{ marginTop: banner ? -(avatarSize / 2 + 42) : 14 }}>
        <div className="relative flex items-center justify-center" style={{ width: box, height: box }}>
          {items.map((g, i) => {
            const ang = (-90 + (i * 360) / items.length + (items.length < 4 ? 20 : 0)) * (Math.PI / 180);
            const x = Math.cos(ang) * R;
            const y = Math.sin(ang) * R;
            return (
              <span key={g.id} className="absolute left-1/2 top-1/2" style={{ transform: `translate(calc(-50% + ${x.toFixed(1)}px), calc(-50% + ${y.toFixed(1)}px)) rotate(${((i * 37) % 30) - 15}deg)` }}>
                <span className="mx-orbit-float block" style={{ animationDelay: `${i * 0.45}s` }}><OrbitGift g={g} size={44} /></span>
              </span>
            );
          })}
          {onAvatarClick ? (
            <button onClick={onAvatarClick} disabled={avatarBusy} className="relative rounded-full" aria-label="Сменить фото">{av}{avatarOverlay}</button>
          ) : (
            <div className="relative">{av}{avatarOverlay}</div>
          )}
        </div>
        <p className="text-[27px] font-extrabold flex items-center justify-center gap-1.5 text-center leading-tight">{name}{badges}</p>
        {statusPill && <span className="mt-2.5 px-4 py-1.5 rounded-full text-[13px] font-bold" style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.14)", color: "#fff" }}>{statusPill}</span>}
        {subtitle && <p className="text-[14px] mt-1.5 text-center mx-muted">{subtitle}</p>}
      </div>
    </div>
  );
}

/** Строка данных профиля: сверху значение жирным, ниже серая подпись (без рамки — прямо на фоне карточки). */
export function InfoRow({ value, label, onClick, accent, right }: { value: ReactNode; label: string; onClick?: () => void; accent?: boolean; right?: ReactNode }) {
  const inner = (
    <>
      <span className="block min-w-0 flex-1 text-left">
        <span className="block text-[17px] font-bold break-words whitespace-pre-wrap leading-snug" style={{ color: accent ? "#5ac8fa" : undefined }}>{value}</span>
        <span className="block text-[13px] mx-muted mt-0.5">{label}</span>
      </span>
      {right}
    </>
  );
  const cls = "w-full flex items-center gap-3 px-5 py-2 text-left";
  return onClick ? <button onClick={onClick} className={cls}>{inner}</button> : <div className={cls}>{inner}</div>;
}

/** Плитка действия под шапкой профиля: тёмное стекло, иконка и подпись. */
export function ProfileTile({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex-1 min-w-0 flex flex-col items-center gap-1.5 rounded-[20px] py-3 active:opacity-70 transition-opacity" style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.09)", color: "#fff" }}>
      {icon}
      <span className="text-[12.5px] font-bold truncate max-w-full px-1">{label}</span>
    </button>
  );
}

/** Вкладки профиля: тёмная лента, активная жирная белая с полоской снизу (Подарки / Посты…). */
export function ProfileTabs<T extends string>({ tabs, value, onChange, labels, right }: { tabs: T[]; value: T; onChange: (t: T) => void; labels: Record<T, string>; right?: ReactNode }) {
  return (
    <div className="flex items-stretch mt-1 mb-3" style={{ background: "rgba(0,0,0,0.34)", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
      <div className="flex flex-1 overflow-x-auto mx-noscrollbar">
        {tabs.map((t) => {
          const on = value === t;
          return (
            <button key={t} onClick={() => onChange(t)} className="relative flex-1 shrink-0 px-4 h-12 text-[15px] font-extrabold whitespace-nowrap" style={{ color: on ? "#fff" : "#8b8b96", minWidth: 96 }}>
              {labels[t]}
              {on && <span className="absolute left-0 right-0 bottom-0 h-[3px] rounded-t-full" style={{ background: "#fff" }} />}
            </button>
          );
        })}
      </div>
      {right}
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
