"use client";

import { startTopup } from "./Wallet";
import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { ChevronRight, EyeOff, Eye, Gift, Lock, Pin, PinOff, Repeat, Search, Send, Sparkles, Tag } from "lucide-react";
import { useToast } from "@/lib/toastContext";
import { GIFTS, GIFT_CATEGORIES, GIFT_CONVERT_RATE, GIFT_MESSAGE_MAX, GIFT_PIN_MAX, GIFT_SALE_FEE, giftById, type GiftCategory, type GiftDef, type GiftNft, type GiftView } from "@/lib/messenger/gifts";
import { NftFigure, hasNftFigure } from "./NftFigures";
import { NFT_SYMBOL_CHARS, NFT_TIERS, backdropOf, isSpecialNumber, modelOf, nftComboChance, nftTier, rarityPct, rollNft, symbolOf } from "@/lib/messenger/nft";
import { mApi, MApiError } from "./api";
import { Avatar, Sheet, Spinner, Switch } from "./ui";
import { PersonRow, usePeopleSearch } from "./NewChatSheet";
import { MAccount } from "./mtypes";
import { useAccounts, useMyAccount, useMyChats } from "./hooks";
import { isSavedMessages, peerUid } from "./util";
import { isPremium } from "@/lib/messenger/premium";

const PATTERN: [number, number, number][] = [[28, 30, -12], [100, 20, 8], [172, 32, 14], [18, 96, 10], [182, 100, -10], [30, 160, 12], [100, 176, -8], [172, 158, -14]];
// искорки, плавающие вверх у редких экземпляров: x, y, задержка, длительность
const SPARKS: [number, number, number, number][] = [[46, 150, 0, 3.4], [160, 140, 1.1, 4.2], [30, 80, 2.0, 3.8], [170, 70, 0.6, 4.6], [70, 40, 1.7, 3.6], [140, 30, 2.6, 4.0], [100, 160, 0.9, 4.4], [55, 115, 2.2, 3.9], [150, 105, 1.4, 4.8]];

/**
 * NFT-карточка: фон, узор, фигурка с оттенком модели и номер. Рисуется по признакам — картинку хранить не нужно.
 * Анимации (motion): "full" — парящая фигурка, мерцающий узор, блик, пульс свечения, искорки и вращающееся кольцо у редких;
 * "lite" — только парение и блик (для сеток); "off" — статично (мелкие значки). По умолчанию зависит от размера.
 */
export function NftArt({ gift, nft, size = 96, sample, motion }: { gift: GiftDef; nft: GiftNft; size?: number | string; sample?: boolean; motion?: "full" | "lite" | "off" }) {
  const uid = useId().replace(/:/g, "");
  const b = backdropOf(nft.backdrop);
  const m = modelOf(nft.model);
  const ch = NFT_SYMBOL_CHARS[symbolOf(nft.symbol).name] ?? "✦";
  const tier = nftTier(nft);
  const tcfg = NFT_TIERS[tier];
  const special = !sample && isSpecialNumber(nft.number, nft.supply);
  const mo = motion ?? (typeof size === "number" ? (size >= 110 ? "full" : size >= 64 ? "lite" : "off") : "lite");
  const live = mo !== "off";
  const full = mo === "full";
  // анимации, которые крутят цвет (filter) — для них базовый оттенок передаём через переменные, а не inline-filter
  const filterAnim = m.anim === "rainbow" || m.anim === "holo" || m.anim === "shimmer" || m.anim === "flame" || m.anim === "aurora";
  const moveAnim = m.anim === "pulse" || m.anim === "glitch" || m.anim === "spin"; // двигают саму фигурку (transform)
  const rainbow = filterAnim;
  const figureStyle = {
    ...(rainbow ? { ["--nft-sat" as string]: String(m.sat), ["--nft-hue" as string]: String(m.hue) } : { filter: `hue-rotate(${m.hue}deg) saturate(${m.sat}) brightness(${m.bright ?? 1}) drop-shadow(0 6px 10px rgba(0,0,0,.5))` }),
    transform: m.flip ? "scaleX(-1)" : undefined,
    transformOrigin: "100px 0px",
    transformBox: "view-box",
  } as unknown as React.CSSProperties;
  const showSparks = full ? tcfg.sparkles : 0;
  const showRing = full && (tier === "epic" || tier === "legendary" || tier === "mythic");
  const showBorder = tier === "legendary" || tier === "mythic" || special;
  const borderColor = special && tier === "common" ? "#ffd56a" : tcfg.color;
  return (
    <svg viewBox="0 0 200 200" width={size} height={size} style={{ borderRadius: "18%", display: "block" }} role="img" aria-label={`${gift.title} №${nft.number}`}>
      <defs>
        <radialGradient id={`bg${uid}`} cx="50%" cy="38%" r="78%"><stop offset="0" stopColor={b.colors[0]} /><stop offset="1" stopColor={b.colors[1]} /></radialGradient>
        <radialGradient id={`gl${uid}`} cx="50%" cy="50%" r="50%"><stop offset="0" stopColor="#fff" stopOpacity="0.28" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></radialGradient>
        <linearGradient id={`sw${uid}`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#fff" stopOpacity="0" /><stop offset="0.5" stopColor="#fff" stopOpacity="0.38" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></linearGradient>
        <filter id={`lit${uid}`} x="-10%" y="-10%" width="120%" height="120%" colorInterpolationFilters="sRGB">
          <feGaussianBlur in="SourceAlpha" stdDeviation="2.6" result="bl" />
          <feSpecularLighting in="bl" surfaceScale="5" specularConstant="0.9" specularExponent="26" lightingColor="#ffffff" result="sp"><fePointLight x="62" y="22" z="150" /></feSpecularLighting>
          <feComposite in="sp" in2="SourceAlpha" operator="in" result="sp2" />
          <feComposite in="SourceGraphic" in2="sp2" operator="arithmetic" k1="0" k2="1" k3="0.8" k4="0" result="lit" />
          <feDropShadow dx="0" dy="5" stdDeviation="4" floodColor={tcfg.color} floodOpacity="0.45" />
        </filter>
        <clipPath id={`cp${uid}`}><rect width="200" height="200" rx="36" /></clipPath>
      </defs>
      <g clipPath={`url(#cp${uid})`}>
        <rect width="200" height="200" fill={`url(#bg${uid})`} />
        {PATTERN.map(([x, y, r], i) => (
          <text key={i} x={x} y={y} fontSize="20" fill="#fff" opacity="0.14" textAnchor="middle" transform={`rotate(${r} ${x} ${y})`} className={full ? "mx-nft-twinkle" : undefined} style={full ? { animationDelay: `${(i * 0.37).toFixed(2)}s` } : undefined}>{ch}</text>
        ))}
        <circle cx="100" cy="95" r="70" fill={`url(#gl${uid})`} className={live ? "mx-nft-glow" : undefined} />
        {showRing && <circle cx="100" cy="95" r="80" fill="none" stroke={tcfg.color} strokeOpacity="0.55" strokeWidth="1.6" strokeDasharray="3 11" strokeLinecap="round" className="mx-nft-ring" />}
        <g className={live ? "mx-nft-float" : undefined}>
          <g className={live && moveAnim ? `mx-nft-${m.anim}` : undefined}>
            {hasNftFigure(gift.id)
              ? <g className={live && filterAnim ? `mx-nft-${m.anim}` : undefined} style={figureStyle}><g filter={`url(#lit${uid})`}><NftFigure id={gift.id} /></g></g>
              : <text x="100" y="124" fontSize="88" textAnchor="middle" className={live && filterAnim ? `mx-nft-${m.anim}` : undefined} style={figureStyle}>{gift.emoji}</text>}
          </g>
        </g>
        {SPARKS.slice(0, showSparks).map(([x, y, d, t], i) => (
          <text key={i} x={x} y={y} fontSize={i % 2 ? 11 : 15} fill={tcfg.color} textAnchor="middle" className="mx-nft-rise" style={{ animationDelay: `${d}s`, animationDuration: `${t}s` }}>✦</text>
        ))}
        <path d="M178 12l9 9-9 9-9-9z" fill={tier === "legendary" || tier === "mythic" ? "#ffa31f" : tier === "epic" ? "#b36bff" : "#4da3ff"} opacity=".95" /><path d="M178 12l9 9H169z" fill="#fff" opacity=".35" />
        <rect x="62" y="166" width="76" height="22" rx="11" fill={special ? "#3a2a05" : "#000"} opacity={special ? 0.7 : 0.35} />
        <text x="100" y="182" fontSize="13" fontWeight="700" fill={special ? "#ffd56a" : "#fff"} textAnchor="middle">{sample ? "NFT" : `${special ? "✦ " : ""}#${nft.number}`}</text>
        {live && (
          <g transform="rotate(20 100 100)">
            <rect className="mx-nft-sweep" x="-90" y="-60" width="64" height="320" fill={`url(#sw${uid})`} />
          </g>
        )}
        {showBorder && <rect x="2" y="2" width="196" height="196" rx="34" fill="none" stroke={borderColor} strokeWidth="3" className={live ? "mx-nft-border" : undefined} strokeOpacity={live ? undefined : 0.7} />}
      </g>
    </svg>
  );
}

/** Плитка подарка: эмодзи на тёмном градиенте; для NFT — карточка по признакам. */
export function GiftArt({ gift, size = 96, imageUrl, badge, nft }: { gift: GiftDef; size?: number; imageUrl?: string; badge?: React.ReactNode; nft?: GiftNft }) {
  if (nft && !imageUrl) return <div className="relative shrink-0" style={{ width: size, height: size }}><NftArt gift={gift} nft={nft} size={size} />{badge}</div>;
  return (
    <div className="relative rounded-2xl flex items-center justify-center shrink-0 select-none overflow-hidden" style={{ width: size, height: size, background: `radial-gradient(circle at 50% 35%, ${gift.colors[0]}, ${gift.colors[1]})` }}>
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt="" className="w-full h-full object-cover" draggable={false} />
      ) : (
        hasNftFigure(gift.id)
          ? <svg viewBox="0 0 200 200" width={size * 0.92} height={size * 0.92} className="mx-nft-bob" style={{ filter: "drop-shadow(0 4px 8px rgba(0,0,0,.45))" }} aria-hidden><NftFigure id={gift.id} /></svg>
          : <span className={gift.nft ? "mx-nft-bob" : undefined} style={{ fontSize: size * 0.52, lineHeight: 1, filter: "drop-shadow(0 4px 8px rgba(0,0,0,.45))" }}>{gift.emoji}</span>
      )}
      {badge}
    </div>
  );
}

/** Признаки NFT списком: модель, фон, узор + шанс выпадения. */
export function NftTraits({ nft }: { nft: GiftNft }) {
  const rows: [string, string, number][] = [
    ["Модель", nft.model, modelOf(nft.model).rarity],
    ["Фон", nft.backdrop, backdropOf(nft.backdrop).rarity],
    ["Узор", nft.symbol, symbolOf(nft.symbol).rarity],
  ];
  return (
    <div className="mx-card w-full mt-4">
      <div className="flex items-center justify-between px-4 py-2.5">
        <span className="mx-muted">Редкость</span>
        <span className="font-semibold" style={{ color: NFT_TIERS[nftTier(nft)].color }}>{NFT_TIERS[nftTier(nft)].label} <span className="mx-muted text-[12.5px] font-normal">· шанс {(nftComboChance(nft) * 100).toFixed(nftComboChance(nft) < 0.0001 ? 5 : 3)}%</span></span>
      </div>
      <div className="flex items-center justify-between px-4 py-2.5"><span className="mx-muted">Номер</span><span>#{nft.number} из {nft.supply}{isSpecialNumber(nft.number, nft.supply) && <span className="ml-1.5 text-[12px] px-1.5 py-0.5 rounded-full" style={{ background: "rgba(255,213,106,.16)", color: "#ffd56a" }}>✦ особый номер</span>}</span></div>
      {rows.map(([k, v, r]) => (
        <div key={k} className="flex items-center justify-between px-4 py-2.5"><span className="mx-muted">{k}</span><span>{v} <span className="mx-muted text-[12.5px]">{rarityPct(r)}</span></span></div>
      ))}
    </div>
  );
}

const money = (n: number) => `${n} ⭐`;

/* ───────────── Магазин: выбрать подарок и отправить ───────────── */

export function GiftShopSheet({ open, onClose, toUid, toName, onSent, me }: { open: boolean; onClose: () => void; toUid?: string; toName?: string; onSent?: () => void; me?: string }) {
  const { toast } = useToast();
  const [cat, setCat] = useState<"all" | GiftCategory>("all");
  const [wallet, setWallet] = useState<number | null>(null);
  const [stock, setStock] = useState<Record<string, number>>({});
  const [picked, setPicked] = useState<GiftDef | null>(null);
  const [message, setMessage] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const sample = useMemo(() => rollNft(1, 1, Math.random, picked?.category === "halloween"), [picked?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [target, setTarget] = useState<{ uid: string; name: string } | null>(toUid ? { uid: toUid, name: toName ?? "" } : null);
  const { results } = usePeopleSearch(q, open && !target);

  useEffect(() => {
    if (!open) return;
    setTarget(toUid ? { uid: toUid, name: toName ?? "" } : null);
    setPicked(null); setMessage(""); setAnonymous(false); setQ("");
    mApi<{ wallet: number; stock: Record<string, number> }>("gifts").then((d) => { setWallet(d.wallet); setStock(d.stock ?? {}); }).catch(() => {});
  }, [open, toUid, toName]);

  const list = useMemo(() => GIFTS.filter((g) => (cat === "all" || g.category === cat) && !(g.limited && (stock[g.id] ?? 0) >= g.limited)), [cat, stock]);

  const send = async () => {
    if (!picked || !target || busy) return;
    setBusy(true);
    try {
      const r = await mApi<{ wallet: number; nft?: GiftNft }>("gifts", { action: "send", toUid: target.uid, giftId: picked.id, message, anonymous });
      setWallet(r.wallet);
      toast("success", r.nft ? `NFT «${picked.title}» №${r.nft.number} отправлен ✨` : `Подарок «${picked.title}» отправлен 🎁`);
      onSent?.();
      onClose();
    } catch (err) {
      if (err instanceof MApiError && err.data?.needTopup) {
        toast("error", err.message);
        startTopup(Math.max(10, (picked?.price ?? 10) - (wallet ?? 0))).catch(() => {});
      } else toast("error", err instanceof MApiError ? err.message : "Не удалось отправить подарок");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title={target?.name ? `Подарок для ${target.name}` : "Отправить подарок"} full zIndex={70}>
      {!target ? (
        <div className="p-4">
          <p className="mx-muted text-[13.5px] mb-2">Кому отправим подарок?</p>
        </div>
      ) : null}
      {!target ? (
        <div>
          <RecipientList me={me} onPick={setTarget} />
        </div>
      ) : picked ? (
        <div className="px-5 pb-6 flex flex-col items-center">
          {picked.nft ? <NftArt gift={picked} nft={sample} size={150} sample /> : <GiftArt gift={picked} size={150} />}
          <p className="text-[19px] font-semibold mt-3">{picked.title}{picked.nft ? " · NFT" : ""}</p>
          <p className="mx-muted text-[14px]">{money(picked.price)}{picked.limited ? ` · тираж ${picked.limited}` : ""}</p>
          {picked.nft && <p className="mx-muted text-[13px] text-center mt-1">Номер, модель, фон и узор выпадут случайно — у каждого экземпляра они свои.</p>}
          <textarea className="mx-input mt-4 w-full" rows={2} maxLength={GIFT_MESSAGE_MAX} placeholder="Добавить подпись (необязательно)" value={message} onChange={(e) => setMessage(e.target.value)} />
          <div className="mx-card w-full mt-3 px-4 py-3 flex items-center justify-between">
            <span>Скрыть моё имя</span>
            <Switch on={anonymous} onChange={setAnonymous} />
          </div>
          <p className="mx-muted text-[13px] mt-3">Баланс: {wallet === null ? "…" : money(wallet)}</p>
          <button className="mx-btn w-full mt-3" onClick={send} disabled={busy}>{busy ? <Spinner size={18} /> : `Отправить за ${money(picked.price)}`}</button>
          <button className="mx-btn-ghost w-full mt-1 py-2" onClick={() => setPicked(null)}>Выбрать другой подарок</button>
          {!toUid && <button className="mx-btn-ghost w-full py-2" onClick={() => { setPicked(null); setTarget(null); }}>Сменить получателя</button>}
        </div>
      ) : (
        <div className="pb-6">
          <div className="flex gap-2 overflow-x-auto px-4 pb-3 mx-scroll">
            {GIFT_CATEGORIES.map((c) => (
              <button key={c.id} onClick={() => setCat(c.id)} className="shrink-0 px-3.5 py-1.5 rounded-full text-[14px]" style={{ background: cat === c.id ? "var(--mx-accent)" : "var(--mx-surface2)", color: cat === c.id ? "var(--mx-accent-text)" : "var(--mx-text)" }}>{c.label}</button>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2.5 px-4">
            {list.map((g) => {
              const left = g.limited ? g.limited - (stock[g.id] ?? 0) : null;
              return (
                <button key={g.id} onClick={() => setPicked(g)} className="flex flex-col items-center rounded-2xl p-2 active:scale-95 transition-transform" style={{ background: "var(--mx-surface2)" }}>
                  <GiftArt gift={g} size={84} badge={g.nft ? <span className="absolute top-1 left-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: "rgba(0,0,0,.45)", color: "#fff" }}>NFT</span> : undefined} />
                  <span className="text-[13px] mt-1.5 truncate max-w-full">{g.title}</span>
                  <span className="text-[13px] font-semibold" style={{ color: "var(--mx-accent)" }}>{money(g.price)}</span>
                  {left !== null && <span className="mx-muted text-[11px]">осталось {left}</span>}
                </button>
              );
            })}
          </div>
          <p className="mx-muted text-[12.5px] text-center px-6 mt-4">Звёзды списываются с кошелька Velox. Пополнить: «Пополнение ⭐» в профиле на сайте.</p>
        </div>
      )}
    </Sheet>
  );
}

/* ───────────── Выбор получателя: недавние, чаты, поиск людей ───────────── */

export function RecipientList({ me, onPick, exclude = [] }: { me?: string; onPick: (a: { uid: string; name: string }) => void; exclude?: string[] }) {
  const [q, setQ] = useState("");
  const { chats } = useMyChats(me ?? null);
  const dms = useMemo(() => chats.filter((c) => c.type === "dm" && !isSavedMessages(c, me ?? "")), [chats, me]);
  const accounts = useAccounts(dms.map((c) => peerUid(c, me ?? "")));
  const { results } = usePeopleSearch(q, true);
  const term = q.trim().toLowerCase().replace(/^@/, "");
  const rows = useMemo(
    () => dms.map((c) => ({ uid: peerUid(c, me ?? ""), acc: accounts[peerUid(c, me ?? "")] })).filter((r): r is { uid: string; acc: MAccount } => !!r.acc && r.uid !== "miligram" && !exclude.includes(r.uid)),
    [dms, accounts, me, exclude] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const filtered = term ? rows.filter((r) => r.acc.displayName.toLowerCase().includes(term) || (r.acc.handle ?? "").toLowerCase().includes(term)) : rows;
  const known = new Set(rows.map((r) => r.uid));
  const others = results.filter((a: MAccount) => !known.has(a.uid) && a.uid !== me && a.uid !== "miligram" && !exclude.includes(a.uid));
  const recent = term ? [] : rows.slice(0, 8);
  // скоро день рождения (ближайшие 14 дней) — повод подарить
  const soon = term ? [] : rows.map((r) => {
    const m = /^(?:\d{4}-)?(\d{2})-(\d{2})$/.exec(r.acc.birthday ?? "");
    if (!m) return null;
    const now = new Date(); now.setHours(0, 0, 0, 0);
    let d = new Date(now.getFullYear(), Number(m[1]) - 1, Number(m[2]));
    if (d < now) d = new Date(now.getFullYear() + 1, Number(m[1]) - 1, Number(m[2]));
    const days = Math.round((d.getTime() - now.getTime()) / 86400000);
    return days <= 14 ? { ...r, days } : null;
  }).filter((x): x is { uid: string; acc: MAccount; days: number } => !!x).sort((a, b) => a.days - b.days);
  const pick = (a: MAccount) => onPick({ uid: a.uid, name: a.displayName });
  return (
    <div className="pb-6">
      <div className="px-4 pb-2">
        <div className="mx-search"><Search size={17} className="mx-muted shrink-0" /><input className="bg-transparent outline-none flex-1 text-[16px] min-w-0" placeholder="Поиск по чатам, имени или @username" value={q} onChange={(e) => setQ(e.target.value)} autoCapitalize="none" autoCorrect="off" /></div>
      </div>
      {soon.length > 0 && (
        <>
          <p className="px-4 pt-2 pb-1 text-[13px] uppercase tracking-wide mx-muted">🎂 Скоро день рождения</p>
          {soon.map((r) => (
            <button key={r.uid} onClick={() => pick(r.acc)} className="w-full flex items-center gap-3 px-4 py-2 text-left active:bg-white/5">
              <Avatar src={r.acc.photoURL} name={r.acc.displayName} seed={r.uid} size={44} />
              <span className="flex-1 min-w-0 truncate">{r.acc.displayName}</span>
              <span className="text-[13px]" style={{ color: "var(--mx-accent)" }}>{r.days === 0 ? "сегодня 🎉" : r.days === 1 ? "завтра" : `через ${r.days} дн.`}</span>
            </button>
          ))}
        </>
      )}
      {recent.length > 0 && (
        <>
          <p className="px-4 pt-2 pb-1 text-[13px] uppercase tracking-wide mx-muted">Недавние</p>
          <div className="flex gap-3 overflow-x-auto px-4 pb-2 mx-noscrollbar">
            {recent.map((r) => (
              <button key={r.uid} onClick={() => pick(r.acc)} className="flex flex-col items-center shrink-0 w-[64px] active:scale-95 transition-transform">
                <Avatar src={r.acc.photoURL} name={r.acc.displayName} seed={r.uid} size={56} />
                <span className="text-[12.5px] mt-1 truncate w-full text-center">{r.acc.displayName.split(" ")[0]}</span>
              </button>
            ))}
          </div>
        </>
      )}
      {filtered.length > 0 && (
        <>
          <p className="px-4 pt-2 pb-1 text-[13px] uppercase tracking-wide mx-muted">{term ? "Мои чаты" : "Чаты"}</p>
          {filtered.map((r) => <PersonRow key={r.uid} acc={r.acc} onPress={() => pick(r.acc)} />)}
        </>
      )}
      {others.length > 0 && (
        <>
          <p className="px-4 pt-3 pb-1 text-[13px] uppercase tracking-wide mx-muted">Люди в Velox</p>
          {others.map((a: MAccount) => <PersonRow key={a.uid} acc={a} onPress={() => pick(a)} />)}
        </>
      )}
      {filtered.length === 0 && others.length === 0 && <p className="mx-muted text-center text-[14px] py-8 px-6">{term.length >= 2 ? "Никого не нашли" : rows.length === 0 ? "Чатов пока нет — найди человека по имени или @username" : ""}</p>}
    </div>
  );
}

function ActionRow({ icon, label, hint, onClick, danger, locked }: { icon: React.ReactNode; label: string; hint?: string; onClick: () => void; danger?: boolean; locked?: boolean }) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-3.5 px-4 py-3 text-left active:bg-white/5" style={{ color: danger ? "var(--mx-danger)" : undefined }}>
      <span className="shrink-0 w-6 flex justify-center" style={{ color: danger ? "var(--mx-danger)" : "var(--mx-accent)" }}>{icon}</span>
      <span className="flex-1 text-[16px]">{label}</span>
      {hint && <span className="mx-muted text-[13px]">{hint}</span>}
      {locked ? <Lock size={15} className="mx-muted" /> : <ChevronRight size={16} className="mx-muted" />}
    </button>
  );
}

/* ───────────── Вкладка «Подарки» в профиле ───────────── */

export function GiftsProfileTab({ uid, mine, name, onChanged }: { uid: string; mine: boolean; name?: string; onChanged?: () => void }) {
  const { toast } = useToast();
  const [gifts, setGifts] = useState<GiftView[] | null>(null);
  const [cat, setCat] = useState<"all" | GiftCategory>("all");
  const [open, setOpen] = useState<GiftView | null>(null);
  const [shop, setShop] = useState(false);
  const [sellOpen, setSellOpen] = useState(false);
  const [sellPrice, setSellPrice] = useState("");
  const [giveOpen, setGiveOpen] = useState(false);
  const [giveTo, setGiveTo] = useState<{ uid: string; name: string } | null>(null);
  const [giveMsg, setGiveMsg] = useState("");
  const [giveBusy, setGiveBusy] = useState(false);
  const { account: myAcc } = useMyAccount(mine ? uid : null);
  const premium = isPremium(myAcc);
  const [statusGiftId, setStatusGiftId] = useState<string | null | undefined>(undefined);
  const curStatusId = statusGiftId !== undefined ? statusGiftId : myAcc?.status?.kind === "nft" ? myAcc.status.giftDocId : null;

  const load = useCallback(() => {
    mApi<{ gifts: GiftView[] }>(`gifts?uid=${mine ? "me" : encodeURIComponent(uid)}`).then((d) => setGifts(d.gifts)).catch(() => setGifts([]));
  }, [uid, mine]);
  useEffect(load, [load]);

  const cats = useMemo(() => {
    const present = new Set((gifts ?? []).map((g) => giftById(g.giftId)?.category).filter(Boolean) as GiftCategory[]);
    return GIFT_CATEGORIES.filter((c) => c.id === "all" || present.has(c.id));
  }, [gifts]);
  const shown = (gifts ?? []).filter((g) => cat === "all" || giftById(g.giftId)?.category === cat);

  const toggle = async (g: GiftView) => {
    try { await mApi("gifts", { action: "toggle", id: g.id, hidden: !g.hidden }); setOpen(null); load(); } catch (e) { toast("error", e instanceof MApiError ? e.message : "Не получилось"); }
  };
  const pin = async (g: GiftView) => {
    try { await mApi("gifts", { action: "pin", id: g.id, pinned: !g.pinned }); toast("success", g.pinned ? "Подарок откреплён" : "Подарок закреплён в профиле"); setOpen(null); load(); } catch (e) { toast("error", e instanceof MApiError ? e.message : "Не получилось"); }
  };
  const listForSale = async (g: GiftView, price: number | null) => {
    try { await mApi("gifts", { action: "list", id: g.id, price }); toast("success", price ? `Выставлен на продажу за ${price} ⭐` : "Снят с продажи"); setSellOpen(false); setOpen(null); load(); } catch (e) { toast("error", e instanceof MApiError ? e.message : "Не получилось"); }
  };
  const buy = async (g: GiftView) => {
    const d = giftById(g.giftId);
    if (!d || !g.salePrice || !confirm(`Купить «${d.title}»${g.nft ? ` #${g.nft.number}` : ""} за ${g.salePrice} ⭐?`)) return;
    try { await mApi("gifts", { action: "buy", id: g.id }); toast("success", "Подарок куплен — он теперь в твоём профиле"); setOpen(null); load(); onChanged?.(); } catch (e) { toast("error", e instanceof MApiError ? e.message : "Не получилось"); }
  };
  const give = async (g: GiftView) => {
    if (!giveTo || giveBusy) return;
    setGiveBusy(true);
    try {
      await mApi("gifts", { action: "transfer", id: g.id, toUid: giveTo.uid, message: giveMsg });
      toast("success", `Подарок отправлен: ${giveTo.name} 🎁`);
      setGiveOpen(false); setGiveTo(null); setGiveMsg(""); setOpen(null); load(); onChanged?.();
    } catch (e) { toast("error", e instanceof MApiError ? e.message : "Не удалось подарить"); } finally { setGiveBusy(false); }
  };
  const wear = async (g: GiftView) => {
    const on = curStatusId === g.id;
    if (!on && !premium) { toast("error", "Статус рядом с ником — только с Mili Premium"); return; }
    try {
      await mApi("profile", { status: on ? null : { kind: "nft", giftDocId: g.id } });
      setStatusGiftId(on ? null : g.id);
      toast("success", on ? "Убрано из статуса" : "Теперь он стоит рядом с твоим ником ✨");
      setOpen(null);
    } catch (e) { toast("error", e instanceof MApiError ? e.message : "Не получилось"); }
  };
  const convert = async (g: GiftView) => {
    const def = giftById(g.giftId);
    const back = Math.floor(g.price * GIFT_CONVERT_RATE);
    if (!def || !confirm(`Обменять «${def.title}» на ${back} ⭐? Подарок исчезнет из профиля.`)) return;
    try { await mApi("gifts", { action: "convert", id: g.id }); toast("success", `+${back} ⭐ на балансе`); setOpen(null); load(); onChanged?.(); } catch (e) { toast("error", e instanceof MApiError ? e.message : "Не получилось"); }
  };

  if (gifts === null) return <div className="flex justify-center py-10"><Spinner /></div>;

  const def = open ? giftById(open.giftId) : undefined;
  return (
    <div className="pb-24 relative">
      {gifts.length > 0 && cats.length > 2 && (
        <div className="flex gap-2 overflow-x-auto px-4 pb-3 mx-scroll">
          {cats.map((c) => (
            <button key={c.id} onClick={() => setCat(c.id)} className="shrink-0 px-3.5 py-1.5 rounded-full text-[14px]" style={{ background: cat === c.id ? "var(--mx-accent)" : "var(--mx-surface2)", color: cat === c.id ? "var(--mx-accent-text)" : "var(--mx-text)" }}>{c.label}</button>
          ))}
        </div>
      )}
      {gifts.length === 0 ? (
        <div className="text-center px-8 py-8">
          <p className="text-[40px]">🎁</p>
          <p className="mx-muted text-[14.5px] mt-1">{mine ? "Пока нет подарков. Друзья могут отправить тебе подарок из твоего профиля." : "Пока нет подарков. Будь первым!"}</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2.5 px-4">
          {shown.map((g) => {
            const d = giftById(g.giftId);
            if (!d) return null;
            return (
              <button key={g.id} onClick={() => setOpen(g)} className="relative rounded-2xl aspect-square overflow-hidden flex items-center justify-center" style={{ opacity: g.hidden ? 0.45 : 1, background: `radial-gradient(circle at 50% 35%, ${d.colors[0]}, ${d.colors[1]})` }}>
                {g.nft?.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={g.nft.imageUrl} alt="" className="w-full h-full object-cover" draggable={false} />
                ) : g.nft ? (
                  <NftArt gift={d} nft={g.nft} size="100%" />
                ) : (
                  <span style={{ fontSize: 52, lineHeight: 1, filter: "drop-shadow(0 4px 8px rgba(0,0,0,.45))" }}>{d.emoji}</span>
                )}
                {g.from && <span className="absolute top-1.5 left-1.5"><Avatar src={g.from.photoURL} name={g.from.displayName} seed={g.from.uid} size={22} /></span>}
                {g.hidden && <EyeOff size={14} className="absolute bottom-1.5 right-1.5 text-white/80" />}
                {g.pinned && <Pin size={14} className="absolute top-1.5 right-1.5 text-white/90" fill="currentColor" />}
                {g.salePrice ? <span className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded-full text-[11px] font-semibold bg-black/55 text-white">{g.salePrice} ⭐</span> : null}
              </button>
            );
          })}
        </div>
      )}
      <div className="sticky bottom-3 px-4 mt-4 flex justify-center">
        <button className="mx-btn px-6 shadow-lg" onClick={() => setShop(true)}><Gift size={17} className="inline mr-1.5 -mt-0.5" />{mine ? "Отправить подарки друзьям" : `Отправить подарок${name ? ` ${name}` : ""}`}</button>
      </div>

      <GiftShopSheet open={shop} onClose={() => setShop(false)} toUid={mine ? undefined : uid} toName={mine ? undefined : name} onSent={() => { if (!mine) load(); }} />

      <Sheet open={!!open && !!def} onClose={() => setOpen(null)} zIndex={65}>
        {open && def && (
          <div className="px-5 pb-8 flex flex-col items-center">
            <GiftArt gift={def} size={160} imageUrl={open.nft?.imageUrl} nft={open.nft} />
            <p className="text-[20px] font-semibold mt-3">{def.title}{open.nft ? ` #${open.nft.number}` : ""}</p>
            <p className="mx-muted text-[14px]">{money(open.price)} · {new Date(open.at).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })}</p>
            <div className="flex items-center gap-2 mt-3">
              {open.from ? (
                <><Avatar src={open.from.photoURL} name={open.from.displayName} seed={open.from.uid} size={28} /><span className="text-[15px]">{open.from.displayName}</span></>
              ) : (
                <span className="mx-muted text-[14.5px]">Анонимный отправитель</span>
              )}
            </div>
            {open.anonymous && open.from && <p className="mx-muted text-[12.5px] mt-1">Отправлен анонимно — другие не видят имя</p>}
            {open.nft && <NftTraits nft={open.nft} />}
            {open.message && <p className="mx-card px-4 py-3 mt-4 w-full text-[15px] whitespace-pre-wrap">{open.message}</p>}
            {open.salePrice ? <p className="mx-card px-4 py-2.5 mt-4 w-full text-[14.5px] text-center">Продаётся за <b>{open.salePrice} ⭐</b></p> : null}
            {mine && (
              <div className="mx-card w-full mt-5 overflow-hidden">
                <ActionRow icon={<Send size={20} />} label="Подарить" hint="другому человеку" onClick={() => { setGiveTo(null); setGiveMsg(""); setGiveOpen(true); }} />
                {!open.hidden && <ActionRow icon={open.pinned ? <PinOff size={20} /> : <Pin size={20} />} label={open.pinned ? "Открепить" : "Закрепить в профиле"} hint={open.pinned ? undefined : `до ${GIFT_PIN_MAX}`} onClick={() => pin(open)} />}
                {open.nft && <ActionRow icon={<Sparkles size={20} />} label={curStatusId === open.id ? "Убрать из статуса" : "Показать возле ника"} hint={premium ? undefined : "Premium"} locked={!premium && curStatusId !== open.id} onClick={() => wear(open)} />}
                {open.salePrice
                  ? <ActionRow icon={<Tag size={20} />} label="Снять с продажи" hint={`${open.salePrice} ⭐`} onClick={() => listForSale(open, null)} />
                  : <ActionRow icon={<Tag size={20} />} label="Продать" onClick={() => { setSellPrice(String(open.price)); setSellOpen(true); }} />}
                <ActionRow icon={open.hidden ? <Eye size={20} /> : <EyeOff size={20} />} label={open.hidden ? "Показать в профиле" : "Скрыть из профиля"} onClick={() => toggle(open)} />
                {!open.nft && <ActionRow icon={<Repeat size={20} />} label={`Обменять на ${Math.floor(open.price * GIFT_CONVERT_RATE)} ⭐`} onClick={() => convert(open)} />}
              </div>
            )}
            {!mine && open.salePrice ? <button className="mx-btn w-full mt-4" onClick={() => buy(open)}>Купить за {open.salePrice} ⭐</button> : null}
          </div>
        )}
      </Sheet>

      <Sheet open={giveOpen && !!open} onClose={() => { setGiveOpen(false); setGiveTo(null); }} title={giveTo ? "Подтверждение" : "Кому подарить?"} full zIndex={75}>
        {open && (giveTo ? (
          <div className="px-5 pb-8 flex flex-col items-center">
            {(() => { const d = giftById(open.giftId); return d ? (open.nft ? <NftArt gift={d} nft={open.nft} size={130} /> : <GiftArt gift={d} size={130} />) : null; })()}
            <p className="text-[18px] font-semibold mt-3 text-center">Подарить {giftById(open.giftId)?.title}{open.nft ? ` №${open.nft.number}` : ""} пользователю {giveTo.name}?</p>
            <p className="mx-muted text-[13px] text-center mt-1">Подарок перейдёт к нему насовсем. Вернуть можно только если он сам подарит или продаст его.</p>
            <textarea className="mx-input mt-4 w-full" rows={2} maxLength={GIFT_MESSAGE_MAX} placeholder="Добавить подпись (необязательно)" value={giveMsg} onChange={(e) => setGiveMsg(e.target.value)} />
            <button className="mx-btn w-full mt-4" onClick={() => give(open)} disabled={giveBusy}>{giveBusy ? <Spinner size={18} /> : "Подарить"}</button>
            <button className="mx-btn-ghost w-full mt-1 py-2" onClick={() => setGiveTo(null)}>Выбрать другого</button>
          </div>
        ) : (
          <RecipientList me={uid} exclude={[uid]} onPick={setGiveTo} />
        ))}
      </Sheet>

      <Sheet open={sellOpen && !!open} onClose={() => setSellOpen(false)} zIndex={70}>
        {open && (
          <div className="px-5 pb-8 flex flex-col gap-3">
            <p className="text-[18px] font-semibold text-center">Цена в ⭐</p>
            <input className="mx-input text-center text-[20px]" inputMode="numeric" value={sellPrice} onChange={(e) => setSellPrice(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="Например, 100" />
            {Number(sellPrice) > 0 && <p className="mx-muted text-[13px] text-center">Ты получишь {Math.floor(Number(sellPrice) * (1 - GIFT_SALE_FEE))} ⭐ (комиссия {Math.round(GIFT_SALE_FEE * 100)}%)</p>}
            <button className="mx-btn" disabled={!(Number(sellPrice) > 0)} onClick={() => listForSale(open, Number(sellPrice))}>Выставить на продажу</button>
          </div>
        )}
      </Sheet>
    </div>
  );
}

/* ───────────── Карточка подарка в чате ───────────── */

export function GiftMessageCard({ giftId, text, price, mine, senderName, anonymous, toName, nft }: { docId?: string; giftId: string; text?: string; price: number; mine: boolean; senderName: string; anonymous?: boolean; toName: string; nft?: GiftNft }) {
  const g = giftById(giftId);
  if (!g) return null;
  const who = mine ? "Вы отправили подарок" : anonymous ? "Вам отправили подарок" : `${senderName} отправил(а) подарок`;
  return (
    <div className="flex justify-center my-3">
      <div className="mx-glass rounded-2xl px-6 py-4 flex flex-col items-center text-center" style={{ maxWidth: 260 }}>
        <p className="text-[13.5px] mx-muted">{mine ? `${who} — ${toName}` : who}</p>
        <div className="my-2"><GiftArt gift={g} size={120} nft={nft} /></div>
        <p className="font-semibold">{g.title}{nft ? ` #${nft.number}` : ""}</p>
        <p className="mx-muted text-[12.5px]">{money(price)}</p>
        {text && <p className="mt-2 text-[14px] whitespace-pre-wrap">{text}</p>}
      </div>
    </div>
  );
}
