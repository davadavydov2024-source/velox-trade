"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { EyeOff, Eye, Gift, Pin, PinOff, Repeat, Send, Shuffle, Sparkles } from "lucide-react";
import { useToast } from "@/lib/toastContext";
import { GIFTS, GIFT_CATEGORIES, GIFT_CONVERT_RATE, GIFT_MESSAGE_MAX, giftById, upgradeTargetOf, type GiftCategory, type GiftDef, type GiftNft, type GiftView } from "@/lib/messenger/gifts";
import { NFT_BACKDROPS, NFT_MODELS, NFT_SYMBOLS, backdropOf, modelOf, rarityPct, rollNft, symbolOf } from "@/lib/messenger/nft";
import { NFT_TIER_LABEL, nftArtMarkup, nftSymbolPath, nftTier } from "@/lib/messenger/nftArt";
import { mApi, MApiError } from "./api";
import { Avatar, Sheet, Spinner, Switch } from "./ui";
import { PersonRow, usePeopleSearch } from "./NewChatSheet";
import { MAccount } from "./mtypes";

/** NFT-карточка: фон, узор, векторная фигурка с оттенком модели и номер. Рисуется по признакам — картинку хранить не нужно. */
export function NftArt({ gift, nft, size = 96, sample, motion: _motion }: { gift: GiftDef; nft: GiftNft; size?: number | string; sample?: boolean; motion?: "on" | "off" }) {
  const uid = useId().replace(/:/g, "");
  const markup = useMemo(
    () => nftArtMarkup({ uid, giftId: gift.id, emoji: gift.emoji, label: sample ? "NFT" : `#${nft.number}`, nft }),
    [uid, gift.id, gift.emoji, sample, nft],
  );
  return <svg viewBox="0 0 200 200" width={size} height={size} style={{ borderRadius: "18%", display: "block" }} role="img" aria-label={`${gift.title} №${nft.number}`} dangerouslySetInnerHTML={{ __html: markup }} />;
}

/** Плитка подарка: эмодзи на тёмном градиенте; для NFT — карточка по признакам. */
export function GiftArt({ gift, size = 96, imageUrl, badge, nft, sample }: { gift: GiftDef; size?: number; imageUrl?: string; badge?: React.ReactNode; nft?: GiftNft; sample?: boolean }) {
  if (nft && !imageUrl) return <div className="relative shrink-0" style={{ width: size, height: size }}><NftArt gift={gift} nft={nft} size={size} sample={sample} />{badge}</div>;
  return (
    <div className="relative rounded-2xl flex items-center justify-center shrink-0 select-none overflow-hidden" style={{ width: size, height: size, background: `radial-gradient(circle at 50% 35%, ${gift.colors[0]}, ${gift.colors[1]})` }}>
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt="" className="w-full h-full object-cover" draggable={false} />
      ) : (
        <span style={{ fontSize: size * 0.52, lineHeight: 1, filter: "drop-shadow(0 4px 8px rgba(0,0,0,.45))" }}>{gift.emoji}</span>
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
      <div className="flex items-center justify-between px-4 py-2.5"><span className="mx-muted">Номер</span><span>#{nft.number} из {nft.supply}</span></div>
      {rows.map(([k, v, r]) => (
        <div key={k} className="flex items-center justify-between px-4 py-2.5"><span className="mx-muted">{k}</span><span>{v} <span className="mx-muted text-[12.5px]">{rarityPct(r)}</span></span></div>
      ))}
    </div>
  );
}

const money = (n: number) => `${n} ⭐`;

/* ───────────── Общие куски: каталог признаков, плашка редкости, превью для витрины ───────────── */

const SHOWCASE_BACKDROPS = ["Полночь", "Изумруд", "Рассвет", "Сакура", "Океан", "Аметист", "Янтарь"];
const SHOWCASE_SYMBOLS = ["Звёзды", "Сердца", "Молнии", "Луны", "Искры"];
const NFT_GIFTS = GIFTS.filter((g) => g.nft);

/** Красивый (но не редкий) образец NFT для витрины магазина — у каждого подарка свой фон и узор. */
function shopPreview(g: GiftDef): GiftNft {
  const i = Math.max(0, NFT_GIFTS.findIndex((x) => x.id === g.id));
  return { number: 1, supply: g.limited ?? 1, model: NFT_MODELS[0].name, backdrop: SHOWCASE_BACKDROPS[i % SHOWCASE_BACKDROPS.length], symbol: SHOWCASE_SYMBOLS[i % SHOWCASE_SYMBOLS.length] };
}

/** «Легендарный» / «Эпический» — по самому редкому признаку экземпляра. */
function TierChip({ nft }: { nft: GiftNft }) {
  const t = nftTier(nft);
  if (t === "common") return null;
  return (
    <span className="text-[12px] font-bold px-2.5 py-0.5 rounded-full mt-1.5" style={{ background: t === "legendary" ? "linear-gradient(90deg,#f7bd2e,#fff2a6)" : "color-mix(in srgb, var(--mx-accent) 25%, transparent)", color: t === "legendary" ? "#4a3000" : "var(--mx-text)" }}>
      {NFT_TIER_LABEL[t]}
    </span>
  );
}

/** Что может выпасть: модели, фоны и узоры с шансом выпадения — как в карточке коллекции Telegram. */
function NftCollectionInfo({ gift }: { gift: GiftDef }) {
  const [tab, setTab] = useState<"model" | "backdrop" | "symbol">("model");
  const tabs = [["model", "Модели", NFT_MODELS.length], ["backdrop", "Фоны", NFT_BACKDROPS.length], ["symbol", "Узоры", NFT_SYMBOLS.length]] as const;
  const items = tab === "model" ? NFT_MODELS : tab === "backdrop" ? NFT_BACKDROPS : NFT_SYMBOLS;
  return (
    <div className="w-full mt-4">
      <div className="flex gap-1 p-1 rounded-full" style={{ background: "var(--mx-surface2)" }}>
        {tabs.map(([id, label, n]) => (
          <button key={id} onClick={() => setTab(id)} className="flex-1 px-2 py-1.5 rounded-full text-[13.5px] font-semibold whitespace-nowrap" style={{ background: tab === id ? "var(--mx-surface)" : "transparent", color: tab === id ? "var(--mx-text)" : "var(--mx-muted)" }}>{label} {n}</button>
        ))}
      </div>
      <div className="flex gap-2.5 overflow-x-auto mx-scroll pt-3 pb-1">
        {items.map((t) => (
          <div key={t.name} className="shrink-0 flex flex-col items-center" style={{ width: 78 }}>
            <div className="w-[72px] h-[72px] rounded-2xl overflow-hidden flex items-center justify-center" style={{ background: "var(--mx-surface2)" }}>
              {tab === "model" ? (
                <NftArt gift={gift} nft={{ number: 1, supply: 1, model: t.name, backdrop: SHOWCASE_BACKDROPS[0], symbol: SHOWCASE_SYMBOLS[0] }} size="100%" sample />
              ) : tab === "backdrop" ? (
                <div className="w-full h-full" style={{ background: `radial-gradient(circle at 50% 38%, ${(t as (typeof NFT_BACKDROPS)[number]).colors[0]}, ${(t as (typeof NFT_BACKDROPS)[number]).colors[1]})` }} />
              ) : (
                <svg viewBox="-12 -12 24 24" width="44" height="44"><path d={nftSymbolPath(t.name)} fill="var(--mx-accent)" /></svg>
              )}
            </div>
            <span className="text-[12px] mt-1 truncate max-w-full">{t.name}</span>
            <span className="mx-muted text-[11px]">{rarityPct(t.rarity)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ───────────── Магазин: выбрать подарок или NFT, купить себе или отправить другу ───────────── */

export function GiftShopSheet({ open, onClose, toUid, toName, onSent }: { open: boolean; onClose: () => void; toUid?: string; toName?: string; onSent?: () => void }) {
  const { toast } = useToast();
  const [cat, setCat] = useState<"all" | GiftCategory>("all");
  const [wallet, setWallet] = useState<number | null>(null);
  const [stock, setStock] = useState<Record<string, number>>({});
  const [meInfo, setMeInfo] = useState<{ uid: string; displayName: string } | null>(null);
  const [picked, setPicked] = useState<GiftDef | null>(null);
  const [message, setMessage] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const [seed, setSeed] = useState(0);
  const [who, setWho] = useState<"self" | "friend">("friend");
  const [friend, setFriend] = useState<{ uid: string; name: string } | null>(null);
  const sample = useMemo(() => rollNft(1, 1), [picked?.id, seed]); // eslint-disable-line react-hooks/exhaustive-deps

  const fixed = toUid ? { uid: toUid, name: toName ?? "" } : null; // открыли из профиля/чата конкретного человека
  const target = fixed ?? (who === "self" && meInfo ? { uid: meInfo.uid, name: meInfo.displayName } : friend);
  const isSelf = !!target && !!meInfo && target.uid === meInfo.uid;
  const { results } = usePeopleSearch(q, open && !fixed && who === "friend" && !!picked && !friend);

  useEffect(() => {
    if (!open) return;
    setPicked(null); setMessage(""); setAnonymous(false); setQ(""); setFriend(null); setWho("friend"); setCat("all");
    mApi<{ wallet: number; stock: Record<string, number>; me?: { uid: string; displayName: string } }>("gifts").then((d) => { setWallet(d.wallet); setStock(d.stock ?? {}); setMeInfo(d.me ?? null); }).catch(() => {});
  }, [open, toUid, toName]);

  const list = useMemo(() => GIFTS.filter((g) => (cat === "all" || g.category === cat) && !(g.limited && (stock[g.id] ?? 0) >= g.limited)), [cat, stock]);
  const leftOf = (g: GiftDef) => (g.limited ? g.limited - (stock[g.id] ?? 0) : null);

  const send = async () => {
    if (!picked || !target || busy) return;
    setBusy(true);
    try {
      const r = await mApi<{ wallet: number; nft?: GiftNft }>("gifts", { action: "send", toUid: target.uid, giftId: picked.id, message: isSelf ? "" : message, anonymous: isSelf ? false : anonymous });
      setWallet(r.wallet);
      toast("success", r.nft ? (isSelf ? `NFT «${picked.title}» №${r.nft.number} теперь у тебя ✨` : `NFT «${picked.title}» №${r.nft.number} отправлен ✨`) : isSelf ? `«${picked.title}» куплен себе 🎁` : `Подарок «${picked.title}» отправлен 🎁`);
      onSent?.();
      onClose();
    } catch (err) {
      if (err instanceof MApiError && err.data?.needTopup) {
        toast("error", err.message);
        window.open("/profile/stars", "_blank");
      } else toast("error", err instanceof MApiError ? err.message : "Не удалось отправить подарок");
    } finally {
      setBusy(false);
    }
  };

  const nftCard = (g: GiftDef) => {
    const left = leftOf(g) ?? 0;
    const pct = g.limited ? Math.max(0, Math.min(100, Math.round((left / g.limited) * 100))) : 0;
    return (
      <button key={g.id} onClick={() => setPicked(g)} className="rounded-2xl p-2 text-left active:scale-[.97] transition-transform" style={{ background: "var(--mx-surface2)" }}>
        <div className="aspect-square w-full"><NftArt gift={g} nft={shopPreview(g)} size="100%" sample /></div>
        <p className="font-semibold text-[14.5px] mt-2 truncate">{g.title}</p>
        <div className="flex items-center justify-between">
          <span className="text-[13.5px] font-semibold" style={{ color: "var(--mx-accent)" }}>{money(g.price)}</span>
          <span className="mx-muted text-[12px]">{left} из {g.limited}</span>
        </div>
        <div className="h-1 rounded-full mt-1.5 overflow-hidden" style={{ background: "var(--mx-line)" }}><div className="h-full rounded-full" style={{ width: `${pct}%`, background: "var(--mx-accent)" }} /></div>
      </button>
    );
  };

  const upTo = picked && !picked.nft ? upgradeTargetOf(picked.id) : undefined;

  return (
    <Sheet open={open} onClose={onClose} title={picked ? picked.title : fixed?.name ? `Подарок для ${fixed.name}` : "Магазин подарков"} full zIndex={70}>
      {picked ? (
        <div className="px-5 pb-6 flex flex-col items-center">
          {picked.nft ? (
            <div className="relative">
              <NftArt gift={picked} nft={sample} size={170} sample />
              <button className="absolute right-1.5 bottom-1.5 w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "rgba(0,0,0,.5)", color: "#fff" }} onClick={() => setSeed((s) => s + 1)} aria-label="Показать другой вариант"><Shuffle size={15} /></button>
            </div>
          ) : <GiftArt gift={picked} size={150} />}
          <p className="text-[19px] font-semibold mt-3">{picked.title}{picked.nft ? " · NFT" : ""}</p>
          <p className="mx-muted text-[14px]">{money(picked.price)}{picked.limited ? ` · осталось ${leftOf(picked)} из ${picked.limited}` : ""}</p>
          {picked.nft && <p className="mx-muted text-[13px] text-center mt-1">Номер, модель, фон и узор выпадут случайно — у каждого экземпляра они свои. Кнопка 🔀 показывает примеры.</p>}
          {upTo && <p className="mx-muted text-[13px] text-center mt-1"><Sparkles size={13} className="inline -mt-0.5 mr-1" />Из такого подарка можно сделать NFT «{upTo.title}» — улучшение доступно в профиле.</p>}
          {picked.nft && <NftCollectionInfo gift={picked} />}

          {!fixed && (
            <div className="w-full mt-4">
              <div className="flex gap-1 p-1 rounded-full" style={{ background: "var(--mx-surface2)" }}>
                {([["self", "Себе"], ["friend", "Другу"]] as const).map(([id, label]) => (
                  <button key={id} onClick={() => setWho(id)} className="flex-1 py-1.5 rounded-full text-[14px] font-semibold" style={{ background: who === id ? "var(--mx-surface)" : "transparent", color: who === id ? "var(--mx-text)" : "var(--mx-muted)" }}>{label}</button>
                ))}
              </div>
              {who === "friend" && (friend ? (
                <div className="mx-card mt-2 px-4 py-2.5 flex items-center justify-between"><span className="truncate">Кому: <b>{friend.name}</b></span><button className="text-[13.5px]" style={{ color: "var(--mx-accent)" }} onClick={() => { setFriend(null); setQ(""); }}>Другой</button></div>
              ) : (
                <div className="mt-2">
                  <input className="mx-input w-full" placeholder="Имя или @username получателя" value={q} onChange={(e) => setQ(e.target.value)} autoCapitalize="none" />
                  {results.map((a: MAccount) => <PersonRow key={a.uid} acc={a} onPress={() => setFriend({ uid: a.uid, name: a.displayName })} />)}
                </div>
              ))}
            </div>
          )}

          {!isSelf && (
            <>
              <textarea className="mx-input mt-4 w-full" rows={2} maxLength={GIFT_MESSAGE_MAX} placeholder="Добавить подпись (необязательно)" value={message} onChange={(e) => setMessage(e.target.value)} />
              <div className="mx-card w-full mt-3 px-4 py-3 flex items-center justify-between">
                <span>Скрыть моё имя</span>
                <Switch on={anonymous} onChange={setAnonymous} />
              </div>
            </>
          )}
          <p className="mx-muted text-[13px] mt-3">Баланс: {wallet === null ? "…" : money(wallet)}</p>
          <button className="mx-btn w-full mt-3" onClick={send} disabled={busy || !target}>{busy ? <Spinner size={18} /> : !target ? "Выбери получателя" : isSelf ? `Купить себе за ${money(picked.price)}` : `Отправить за ${money(picked.price)}`}</button>
          <button className="mx-btn-ghost w-full mt-1 py-2" onClick={() => setPicked(null)}>Выбрать другой</button>
        </div>
      ) : (
        <div className="pb-6">
          <div className="flex gap-2 overflow-x-auto px-4 pb-3 mx-scroll">
            {GIFT_CATEGORIES.map((c) => (
              <button key={c.id} onClick={() => setCat(c.id)} className="shrink-0 px-3.5 py-1.5 rounded-full text-[14px]" style={{ background: cat === c.id ? "var(--mx-accent)" : "var(--mx-surface2)", color: cat === c.id ? "var(--mx-accent-text)" : "var(--mx-text)" }}>{c.label}</button>
            ))}
          </div>
          {cat === "nft" ? (
            <div className="grid grid-cols-2 gap-3 px-4">{list.map(nftCard)}</div>
          ) : (
            <div className="grid grid-cols-3 gap-2.5 px-4">
              {list.map((g) => {
                const left = leftOf(g);
                return (
                  <button key={g.id} onClick={() => setPicked(g)} className="flex flex-col items-center rounded-2xl p-2 active:scale-95 transition-transform" style={{ background: "var(--mx-surface2)" }}>
                    <GiftArt gift={g} size={84} nft={g.nft ? shopPreview(g) : undefined} sample badge={g.nft ? <span className="absolute top-1 left-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: "rgba(0,0,0,.45)", color: "#fff" }}>NFT</span> : undefined} />
                    <span className="text-[13px] mt-1.5 truncate max-w-full">{g.title}</span>
                    <span className="text-[13px] font-semibold" style={{ color: "var(--mx-accent)" }}>{money(g.price)}</span>
                    {left !== null && <span className="mx-muted text-[11px]">осталось {left}</span>}
                  </button>
                );
              })}
            </div>
          )}
          <p className="mx-muted text-[12.5px] text-center px-6 mt-4">Звёзды списываются с кошелька Velox{wallet !== null ? ` (сейчас ${money(wallet)})` : ""}. Пополнить: «Пополнение ⭐» в профиле на сайте. Любой обычный подарок потом можно улучшить до NFT.</p>
        </div>
      )}
    </Sheet>
  );
}

/* ───────────── Улучшить обычный подарок до NFT ───────────── */

function UpgradeSheet({ gift, onClose, onDone }: { gift: GiftView | null; onClose: () => void; onDone: () => void }) {
  const { toast } = useToast();
  const def = gift ? giftById(gift.giftId) : undefined;
  const target = gift ? upgradeTargetOf(gift.giftId) : undefined;
  const [wallet, setWallet] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<GiftNft | null>(null);
  const [spin, setSpin] = useState<GiftNft>(() => rollNft(1, 1));
  const idle = useMemo(() => (target ? shopPreview(target) : null), [target]);

  useEffect(() => {
    if (!gift) return;
    setResult(null);
    mApi<{ wallet: number }>("gifts").then((d) => setWallet(d.wallet)).catch(() => {});
  }, [gift]);
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => setSpin(rollNft(1, 1)), 110); // «барабан» признаков, пока идёт улучшение
    return () => clearInterval(t);
  }, [busy]);

  const go = async () => {
    if (!gift || busy) return;
    setBusy(true);
    try {
      const [r] = await Promise.all([mApi<{ wallet: number; nft: GiftNft }>("gifts", { action: "upgrade", id: gift.id }), new Promise((res) => setTimeout(res, 1500))]);
      setWallet(r.wallet); setResult(r.nft); onDone();
      toast("success", `Готово! Твой NFT №${r.nft.number} ✨`);
    } catch (err) {
      if (err instanceof MApiError && err.data?.needTopup) {
        toast("error", err.message);
        window.open("/profile/stars", "_blank");
      } else toast("error", err instanceof MApiError ? err.message : "Не удалось улучшить подарок");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={!!gift && !!target && !!def} onClose={onClose} title="Улучшить до NFT" full zIndex={75}>
      {gift && target && def && idle && (
        <div className="px-5 pb-6 flex flex-col items-center">
          <div className={busy ? "animate-pulse" : ""}>
            <NftArt gift={target} nft={result ?? (busy ? spin : idle)} size={180} sample={!result} />
          </div>
          <p className="text-[19px] font-semibold mt-3">{target.title}{result ? ` #${result.number}` : ""}</p>
          {result ? (
            <>
              <p className="mx-muted text-[14px]">Тираж {result.supply} · теперь это уникальный NFT</p>
              <TierChip nft={result} />
              <NftTraits nft={result} />
              <button className="mx-btn w-full mt-4" onClick={onClose}>Отлично</button>
            </>
          ) : (
            <>
              <p className="mx-muted text-[14px]">«{def.title}» станет уникальным NFT · тираж {target.limited}</p>
              <p className="mx-muted text-[13px] text-center mt-1">После улучшения выпадут номер, модель, фон и узор. NFT нельзя обменять на ⭐, зато его можно поставить статусом, закрепить в профиле и передать другу.</p>
              <NftCollectionInfo gift={target} />
              <p className="mx-muted text-[13px] mt-4">Баланс: {wallet === null ? "…" : money(wallet)}</p>
              <button className="mx-btn w-full mt-3" onClick={go} disabled={busy}>{busy ? <Spinner size={18} /> : <><Sparkles size={16} className="inline mr-1.5 -mt-0.5" />Улучшить за {money(target.price)}</>}</button>
            </>
          )}
        </div>
      )}
    </Sheet>
  );
}

/* ───────────── Передать NFT другому человеку ───────────── */

function TransferSheet({ gift, onClose, onDone }: { gift: GiftView | null; onClose: () => void; onDone: () => void }) {
  const { toast } = useToast();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const { results } = usePeopleSearch(q, !!gift);
  const def = gift ? giftById(gift.giftId) : undefined;
  useEffect(() => { if (gift) setQ(""); }, [gift]);

  const give = async (a: MAccount) => {
    if (!gift || !def || busy) return;
    if (!confirm(`Передать «${def.title}${gift.nft ? ` #${gift.nft.number}` : ""}» пользователю ${a.displayName}? Отменить передачу нельзя.`)) return;
    setBusy(true);
    try {
      await mApi("gifts", { action: "transfer", id: gift.id, toUid: a.uid });
      toast("success", `NFT передан — ${a.displayName}`);
      onDone();
      onClose();
    } catch (err) {
      toast("error", err instanceof MApiError ? err.message : "Не удалось передать");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={!!gift && !!def} onClose={onClose} title="Передать NFT" full zIndex={75}>
      {gift && def && (
        <div className="px-4 pb-6">
          <div className="flex items-center gap-3 mb-3">
            <GiftArt gift={def} size={56} nft={gift.nft} />
            <div className="min-w-0"><p className="font-semibold truncate">{def.title}{gift.nft ? ` #${gift.nft.number}` : ""}</p><p className="mx-muted text-[13px]">Бесплатно. NFT уйдёт из твоего профиля и статуса.</p></div>
          </div>
          <input className="mx-input w-full" placeholder="Имя или @username получателя" value={q} onChange={(e) => setQ(e.target.value)} autoFocus autoCapitalize="none" />
          <div className="mt-2">
            {results.map((a: MAccount) => <PersonRow key={a.uid} acc={a} onPress={() => give(a)} />)}
            {q.trim().length >= 2 && results.length === 0 && <p className="mx-muted text-[14px] px-2 py-3">Никого не найдено</p>}
          </div>
        </div>
      )}
    </Sheet>
  );
}

/* ───────────── Вкладка «Подарки» в профиле ───────────── */

export function GiftsProfileTab({ uid, mine, name, onChanged }: { uid: string; mine: boolean; name?: string; onChanged?: () => void }) {
  const { toast } = useToast();
  const [gifts, setGifts] = useState<GiftView[] | null>(null);
  const [cat, setCat] = useState<"all" | GiftCategory>("all");
  const [open, setOpen] = useState<GiftView | null>(null);
  const [shop, setShop] = useState(false);
  const [upgrade, setUpgrade] = useState<GiftView | null>(null);
  const [transfer, setTransfer] = useState<GiftView | null>(null);

  const load = useCallback(() => {
    mApi<{ gifts: GiftView[] }>(`gifts?uid=${mine ? "me" : encodeURIComponent(uid)}`).then((d) => setGifts(d.gifts)).catch(() => setGifts([]));
  }, [uid, mine]);
  useEffect(load, [load]);

  const cats = useMemo(() => {
    const present = new Set((gifts ?? []).map((g) => giftById(g.giftId)?.category).filter(Boolean) as GiftCategory[]);
    return GIFT_CATEGORIES.filter((c) => c.id === "all" || present.has(c.id));
  }, [gifts]);
  const shown = (gifts ?? []).filter((g) => cat === "all" || giftById(g.giftId)?.category === cat);

  const fail = (e: unknown) => toast("error", e instanceof MApiError ? e.message : "Не получилось");
  const toggle = async (g: GiftView) => {
    try { await mApi("gifts", { action: "toggle", id: g.id, hidden: !g.hidden }); setOpen(null); load(); } catch (e) { fail(e); }
  };
  const pin = async (g: GiftView) => {
    try { await mApi("gifts", { action: "pin", id: g.id, pinned: !g.pinned }); toast("success", g.pinned ? "Откреплено" : "Закреплено вверху профиля"); setOpen(null); load(); } catch (e) { fail(e); }
  };
  const makeStatus = async (g: GiftView) => {
    try { await mApi("profile", { status: { kind: "nft", giftDocId: g.id } }); toast("success", "Статус установлен — NFT виден рядом с ником"); setOpen(null); onChanged?.(); } catch (e) { fail(e); }
  };
  const convert = async (g: GiftView) => {
    const def = giftById(g.giftId);
    const back = Math.floor(g.price * GIFT_CONVERT_RATE);
    if (!def || !confirm(`Обменять «${def.title}» на ${back} ⭐? Подарок исчезнет из профиля.`)) return;
    try { await mApi("gifts", { action: "convert", id: g.id }); toast("success", `+${back} ⭐ на балансе`); setOpen(null); load(); onChanged?.(); } catch (e) { fail(e); }
  };

  if (gifts === null) return <div className="flex justify-center py-10"><Spinner /></div>;

  const def = open ? giftById(open.giftId) : undefined;
  const upTo = open && !open.nft ? upgradeTargetOf(open.giftId) : undefined;
  const nftCount = gifts.filter((g) => g.nft).length;
  return (
    <div className="pb-24 relative">
      {nftCount > 0 && <p className="mx-muted text-[13px] px-4 pb-2">✨ NFT в коллекции: {nftCount}</p>}
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
          <p className="mx-muted text-[14.5px] mt-1">{mine ? "Пока нет подарков. Купи NFT себе или попроси друзей отправить подарок — обычный подарок можно улучшить до NFT." : "Пока нет подарков. Будь первым!"}</p>
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
                {g.pinned && <Pin size={14} className="absolute top-1.5 right-1.5 text-white/90" style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,.6))" }} />}
                {mine && !g.nft && upgradeTargetOf(g.giftId) && <span className="absolute bottom-1.5 left-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: "rgba(0,0,0,.5)", color: "#fff" }}>✨ NFT</span>}
                {g.hidden && <EyeOff size={14} className="absolute bottom-1.5 right-1.5 text-white/80" />}
              </button>
            );
          })}
        </div>
      )}
      <div className="sticky bottom-3 px-4 mt-4 flex justify-center">
        <button className="mx-btn px-6 shadow-lg" onClick={() => setShop(true)}><Gift size={17} className="inline mr-1.5 -mt-0.5" />{mine ? "Магазин подарков и NFT" : `Отправить подарок${name ? ` ${name}` : ""}`}</button>
      </div>

      <GiftShopSheet open={shop} onClose={() => setShop(false)} toUid={mine ? undefined : uid} toName={mine ? undefined : name} onSent={() => { load(); }} />
      <UpgradeSheet gift={upgrade} onClose={() => setUpgrade(null)} onDone={() => { load(); setOpen(null); }} />
      <TransferSheet gift={transfer} onClose={() => setTransfer(null)} onDone={() => { load(); setOpen(null); onChanged?.(); }} />

      <Sheet open={!!open && !!def} onClose={() => setOpen(null)} zIndex={65}>
        {open && def && (
          <div className="px-5 pb-8 flex flex-col items-center">
            <GiftArt gift={def} size={170} imageUrl={open.nft?.imageUrl} nft={open.nft} />
            <p className="text-[20px] font-semibold mt-3">{def.title}{open.nft ? ` #${open.nft.number}` : ""}</p>
            {open.nft && <TierChip nft={open.nft} />}
            <p className="mx-muted text-[14px] mt-1">{money(open.price)} · {new Date(open.at).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })}</p>
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
            {mine && (
              <div className="w-full mt-5 flex flex-col gap-2">
                {open.nft && <button className="mx-btn" onClick={() => makeStatus(open)}><Sparkles size={16} className="inline mr-1.5 -mt-0.5" />Поставить статусом рядом с ником</button>}
                {upTo && <button className="mx-btn" onClick={() => setUpgrade(open)}><Sparkles size={16} className="inline mr-1.5 -mt-0.5" />Улучшить до NFT · {money(upTo.price)}</button>}
                <button className="mx-btn-ghost py-2" onClick={() => pin(open)}>{open.pinned ? <><PinOff size={15} className="inline mr-1.5 -mt-0.5" />Открепить от профиля</> : <><Pin size={15} className="inline mr-1.5 -mt-0.5" />Закрепить вверху профиля</>}</button>
                {open.nft && <button className="mx-btn-ghost py-2" onClick={() => setTransfer(open)}><Send size={15} className="inline mr-1.5 -mt-0.5" />Передать другому</button>}
                <button className="mx-btn-ghost py-2" onClick={() => toggle(open)}>{open.hidden ? <><Eye size={16} className="inline mr-1.5 -mt-0.5" />Показать в профиле</> : <><EyeOff size={16} className="inline mr-1.5 -mt-0.5" />Скрыть из профиля</>}</button>
                {!open.nft && <button className="mx-btn-ghost py-2" onClick={() => convert(open)}><Repeat size={15} className="inline mr-1.5 -mt-0.5" />Обменять на {Math.floor(open.price * GIFT_CONVERT_RATE)} ⭐</button>}
              </div>
            )}
          </div>
        )}
      </Sheet>
    </div>
  );
}

/* ───────────── Карточка подарка в чате ───────────── */

export function GiftMessageCard({ giftId, text, price, mine, senderName, anonymous, toName, nft }: { giftId: string; text?: string; price: number; mine: boolean; senderName: string; anonymous?: boolean; toName: string; nft?: GiftNft }) {
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
