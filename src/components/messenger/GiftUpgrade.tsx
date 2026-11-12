"use client";

import { useEffect, useMemo, useState } from "react";
import { Repeat, Send, Store } from "lucide-react";
import { useToast } from "@/lib/toastContext";
import { giftUpgradePrice, type GiftDef, type GiftNft } from "@/lib/messenger/gifts";
import { NFT_BACKDROPS, NFT_MODELS, NFT_SYMBOLS, backdropOf, modelOf, nftValue, rarityPct, symbolOf } from "@/lib/messenger/nft";
import { mApi, MApiError } from "./api";
import { Sheet, Spinner } from "./ui";
import { startTopup } from "./Wallet";
import { NftHero } from "./NftHero";
import { GiftArt } from "./Gifts";

/** Конфетти при раскрытии NFT (чистый CSS, без библиотек). */
export function Confetti({ count = 46 }: { count?: number }) {
  const bits = useMemo(
    () => Array.from({ length: count }, (_, i) => ({ left: Math.random() * 100, delay: Math.random() * 0.5, dur: 1.6 + Math.random() * 1.4, color: ["#7c6cff", "#ffd56a", "#ff5ca8", "#3ee6a8", "#4da3ff", "#ff8a1f"][i % 6], rot: Math.random() * 360, w: 5 + Math.random() * 5 })),
    [count]
  );
  return (
    <div className="mx-confetti" aria-hidden>
      {bits.map((b, i) => (
        <span key={i} style={{ left: `${b.left}%`, width: b.w, height: b.w * 1.6, background: b.color, animationDelay: `${b.delay}s`, animationDuration: `${b.dur}s`, transform: `rotate(${b.rot}deg)` }} />
      ))}
    </div>
  );
}

export interface UpgradeResult { nft: GiftNft; wallet: number; issued: number }

/** Экран «Улучшить подарок»: что даёт NFT и кнопка с ценой. */
export function UpgradeSheet({ open, onClose, giftDocId, def, onUpgraded }: { open: boolean; onClose: () => void; giftDocId: string; def: GiftDef; onUpgraded: (r: UpgradeResult) => void }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const cost = giftUpgradePrice(def);
  const go = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await mApi<UpgradeResult>("gifts", { action: "upgrade", id: giftDocId });
      onUpgraded(r);
    } catch (err) {
      if (err instanceof MApiError && err.data?.needTopup) {
        toast("error", err.message);
        startTopup(cost).catch(() => {});
      } else toast("error", err instanceof MApiError ? err.message : "Не удалось улучшить подарок");
    } finally { setBusy(false); }
  };
  const perks: [React.ReactNode, string, string][] = [
    [<Sparkle key="a" />, "Уникальность", `Случайная модель, фон и символ из ${NFT_MODELS.filter((m) => !m.hw).length} моделей, ${NFT_BACKDROPS.filter((m) => !m.hw).length} фонов и ${NFT_SYMBOLS.filter((m) => !m.hw).length} символов, и свой номер.`],
    [<Send key="b" size={20} />, "Передача", "Подарок можно передать любому человеку в мессенджере."],
    [<Store key="c" size={20} />, "Торговля", "Его можно продать или купить на маркете, а ещё носить как статус."],
  ];
  return (
    <Sheet open={open} onClose={onClose} zIndex={80}>
      <div className="px-5 pb-6 flex flex-col items-center">
        <GiftArt gift={def} size={150} flat />
        <p className="text-[21px] font-bold mt-2">Улучшить подарок</p>
        <p className="mx-muted text-[14px] text-center">Превратите подарок в уникальную коллекционную вещь</p>
        <div className="w-full mt-5 space-y-4">
          {perks.map(([icon, t, d]) => (
            <div key={t} className="flex gap-3">
              <span className="w-6 shrink-0 flex justify-center pt-0.5" style={{ color: "var(--mx-accent)" }}>{icon}</span>
              <div><p className="font-semibold text-[15.5px]">{t}</p><p className="mx-muted text-[14px]">{d}</p></div>
            </div>
          ))}
        </div>
        <button className="mx-btn w-full mt-6" onClick={go} disabled={busy}>{busy ? <Spinner size={18} /> : `Улучшить за ${cost} 🪙`}</button>
      </div>
    </Sheet>
  );
}

function Sparkle() { return <span className="text-[18px]">✦</span>; }

function Chip({ r }: { r: number }) {
  return <span className="text-[12px] font-medium px-1.5 py-0.5 rounded-md" style={{ background: "color-mix(in srgb, var(--mx-accent) 16%, transparent)", color: "var(--mx-accent)" }}>{rarityPct(r)}</span>;
}

/** Раскрытие результата: признаки «прокручиваются», затем встают на место, сверху конфетти. */
export function RevealSheet({ open, onClose, def, nft, price, issued, ownerName, onTransfer, onSell, onWear, wearing }: {
  open: boolean; onClose: () => void; def: GiftDef; nft: GiftNft; price: number; issued: number; ownerName: string;
  onTransfer: () => void; onSell: () => void; onWear: () => void; wearing: boolean;
}) {
  const [done, setDone] = useState(false);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!open) return;
    setDone(false);
    const t = setTimeout(() => setDone(true), 2200);
    const i = setInterval(() => setTick((n) => n + 1), 90);
    return () => { clearTimeout(t); clearInterval(i); };
  }, [open, nft.number]);
  useEffect(() => { if (done) { /* без повторов анимации */ } }, [done]);
  const spin = (list: { name: string }[]) => list[(tick * 7 + list.length) % list.length].name;
  const attrs: [string, string, number | null][] = done
    ? [["Модель", nft.model, modelOf(nft.model).rarity], ["Символ", nft.symbol, symbolOf(nft.symbol).rarity], ["Фон", nft.backdrop, backdropOf(nft.backdrop).rarity]]
    : [["Модель", spin(NFT_MODELS.filter((m) => !m.hw)), null], ["Символ", spin(NFT_SYMBOLS.filter((m) => !m.hw)), null], ["Фон", spin(NFT_BACKDROPS.filter((m) => !m.hw)), null]];
  return (
    <Sheet open={open} onClose={onClose} full zIndex={85}>
      <div className="relative pb-6">
        {done && <Confetti />}
        {done ? <NftHero gift={def} nft={nft} /> : (
          <div className="h-[280px] flex flex-col items-center justify-center" style={{ background: "radial-gradient(circle at 50% 42%, #3a3f6b, #0b0c14)" }}>
            <GiftArt gift={def} size={130} flat />
            <p className="text-[18px] font-bold mt-3">{def.title}</p>
            <p className="mx-muted text-[13px]">Улучшаем подарок…</p>
          </div>
        )}
        <div className="grid grid-cols-4 gap-2 px-4 mt-3">
          <ActionBtn icon={<Repeat size={19} />} label="Передать" onClick={onTransfer} disabled={!done} />
          <ActionBtn icon={<Store size={19} />} label="Продать" onClick={onSell} disabled={!done} />
          <ActionBtn icon={<span className="text-[18px] leading-none">👑</span>} label={wearing ? "Снять" : "Надеть"} onClick={onWear} disabled={!done} />
        </div>
        <div className="mx-card mx-4 mt-3 mx-reveal-card" style={{ margin: "12px 16px 0" }}>
          <Row k="Владелец" v={ownerName} />
          {attrs.map(([k, v, r]) => (
            <Row key={k} k={k} v={<span className="flex items-center gap-2"><span className={done ? "" : "mx-muted"}>{v}</span>{r !== null && <Chip r={r} />}</span>} />
          ))}
          <Row k="Выпущено" v={issued.toLocaleString("ru-RU")} />
          <Row k="Ценность" v={done ? `~ ${nftValue(nft, price)} 🪙` : "…"} />
          <Row k="Улучшен" v={`${new Date(nft.upAt ?? Date.now()).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })} · ${nft.upPrice ?? 0} 🪙`} />
        </div>
        <div className="px-4 mt-4"><button className="mx-btn w-full" onClick={onClose} disabled={!done}>OK</button></div>
      </div>
    </Sheet>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="flex items-center justify-between gap-4 px-4 py-2.5"><span className="mx-muted">{k}</span><span className="text-right min-w-0 truncate">{v}</span></div>;
}

export function ActionBtn({ icon, label, onClick, disabled, active }: { icon: React.ReactNode; label: string; onClick: () => void; disabled?: boolean; active?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} className="rounded-2xl py-2.5 flex flex-col items-center gap-1 text-[12.5px] disabled:opacity-40 active:scale-95 transition-transform" style={{ background: active ? "var(--mx-line)" : "var(--mx-surface2)" }}>
      <span style={{ color: "var(--mx-accent)" }}>{icon}</span>{label}
    </button>
  );
}
