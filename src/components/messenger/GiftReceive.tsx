"use client";

import { useEffect, useRef, useState } from "react";
import { Gift as GiftIcon, Repeat, Sparkles } from "lucide-react";
import { useToast } from "@/lib/toastContext";
import { canUpgradeGift, giftById, giftUpgradePrice, type GiftNft } from "@/lib/messenger/gifts";

const money = (n: number) => `${n} 🪙`;
import { nftValue } from "@/lib/messenger/nft";
import { mApi, MApiError } from "./api";
import { Sheet, Spinner } from "./ui";
import { GiftArt } from "./Gifts";
import { NftDetails, NftHero } from "./NftHero";
import { Confetti, UpgradeSheet, type UpgradeResult } from "./GiftUpgrade";
import { RecipientList } from "./Gifts";

/* ───────── какие подарки уже «распакованы» — чтобы анимация не повторялась каждый раз ───────── */
const OPENED_KEY = "mx-gifts-opened";

/** Открывали ли уже этот подарок-сообщение на этом устройстве (чтобы не играть анимацию повторно). */
export function isGiftMsgOpened(msgId: string): boolean {
  if (typeof localStorage === "undefined") return true;
  return loadOpened().has(msgId);
}

function loadOpened(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(OPENED_KEY) || "[]"));
  } catch {
    return new Set();
  }
}
function markOpened(msgId: string) {
  try {
    const s = loadOpened();
    if (s.size > 500) {
      // не даём списку расти бесконечно
      const arr = Array.from(s).slice(-300);
      localStorage.setItem(OPENED_KEY, JSON.stringify(arr));
    }
    s.add(msgId);
    localStorage.setItem(OPENED_KEY, JSON.stringify(Array.from(s)));
  } catch {}
}

/** Закрытая коробка подарка с бантом — то, что видно в чате до того, как получатель её открыл. */
export function ClosedBox({ size = 120 }: { size?: number }) {
  return (
    <div className="relative mx-gift-box" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" width={size} height={size} role="img" aria-label="Подарок">
        <defs>
          <linearGradient id="mxbox" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--mx-accent)" stopOpacity="0.95" />
            <stop offset="1" stopColor="var(--mx-accent)" stopOpacity="0.65" />
          </linearGradient>
        </defs>
        <rect x="14" y="42" width="72" height="46" rx="7" fill="url(#mxbox)" />
        <rect x="14" y="40" width="72" height="16" rx="4" fill="#fff" opacity="0.22" />
        <rect x="44" y="40" width="12" height="48" fill="#fff" opacity="0.65" />
        <path d="M50 40 C 30 40, 24 14, 42 16 C 54 18, 50 34, 50 40 Z" fill="#fff" opacity="0.65" />
        <path d="M50 40 C 70 40, 76 14, 58 16 C 46 18, 50 34, 50 40 Z" fill="#fff" opacity="0.8" />
      </svg>
    </div>
  );
}

/** Коробка, которая «подпрыгивает», раскрывается и рассыпается конфетти — момент получения подарка, как в Telegram. */
function UnwrapAnim({ onDone }: { onDone: () => void }) {
  const [stage, setStage] = useState<"idle" | "pop" | "burst">("idle");
  useEffect(() => {
    const t1 = setTimeout(() => setStage("pop"), 550);
    const t2 = setTimeout(() => setStage("burst"), 780);
    const t3 = setTimeout(onDone, 1450);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="h-[280px] flex flex-col items-center justify-center relative" style={{ background: "radial-gradient(circle at 50% 42%, #3a3f6b, #0b0c14)" }}>
      {stage === "burst" && <Confetti count={60} />}
      <div className={stage === "idle" ? "mx-gift-shake" : stage === "pop" ? "mx-gift-pop" : "mx-gift-pop-out"}>
        <ClosedBox size={128} />
      </div>
      <p className="mx-muted text-[13px] mt-4">{stage === "idle" ? "Открываем подарок…" : ""}</p>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-2.5">
      <span className="mx-muted">{k}</span>
      <span className="text-right min-w-0 truncate">{v}</span>
    </div>
  );
}

/**
 * Просмотр подарка из сообщения в чате, как в Telegram: если это ещё не открывали — короткая анимация
 * распаковки, затем карточка с подробностями. Для своего неулучшенного подарка — сразу кнопки
 * «Улучшить до NFT» и «Передать».
 */
export function GiftReceiveSheet({
  open, onClose, msgId, giftId, giftDocId, price, text, mine, anonymous, senderName, toName, me, toUid, nft: nftProp, onOpened,
}: {
  open: boolean; onClose: () => void; msgId: string; giftId: string; giftDocId?: string; price: number; text?: string;
  mine: boolean; anonymous?: boolean; senderName: string; toName: string; me?: string; toUid?: string;
  nft?: GiftNft; // NFT, который пришёл вместе с сообщением (подарок-NFT или переданный)
  onOpened?: () => void; // получатель впервые открыл подарок
}) {
  const { toast } = useToast();
  const def = giftById(giftId);
  const [nft, setNft] = useState<GiftNft | undefined>(undefined);
  const [unwrapping, setUnwrapping] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const [upOpen, setUpOpen] = useState(false);
  const [giveOpen, setGiveOpen] = useState(false);
  const [giving, setGiving] = useState(false);
  const everOpened = useRef(loadOpened().has(msgId));
  const canManage = !!giftDocId && !mine && me && toUid === me; // это мой полученный подарок — можно распоряжаться им

  useEffect(() => {
    if (!open) return;
    setNft(undefined);
    if (!everOpened.current && !mine) setUnwrapping(true);
    else setUnwrapping(false);
  }, [open, msgId, mine]);

  if (!def) return null;

  const finishUnwrap = () => {
    markOpened(msgId);
    everOpened.current = true;
    setUnwrapping(false);
    onOpened?.();
    if (nft ?? nftProp) { setCelebrate(true); setTimeout(() => setCelebrate(false), 3200); } // как в Telegram: коллекционный подарок раскрывается с конфетти
  };

  const who = mine ? `Вы отправили подарок — ${toName}` : anonymous ? "Вам отправили подарок анонимно" : `${senderName} отправил(а) вам подарок`;
  const curNft = nft ?? nftProp;
  const upgradeable = canManage && canUpgradeGift(def) && !curNft;

  const send = async (toUidPick: string) => {
    if (!giftDocId || giving) return;
    setGiving(true);
    try {
      await mApi("gifts", { action: "transfer", id: giftDocId, toUid: toUidPick });
      toast("success", "Подарок передан");
      setGiveOpen(false);
      onClose();
    } catch (err) {
      toast("error", err instanceof MApiError ? err.message : "Не удалось передать подарок");
    } finally {
      setGiving(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} full zIndex={82}>
      <div className="pb-6 relative">
        {celebrate && <Confetti count={60} />}
        {unwrapping ? (
          <UnwrapAnim onDone={finishUnwrap} />
        ) : curNft ? (
          <NftHero gift={def} nft={curNft} />
        ) : (
          <div className="flex flex-col items-center py-7 px-5 text-center">
            <p className="mx-muted text-[13.5px] mb-2">{who}</p>
            <GiftArt gift={def} size={150} flat />
            <p className="text-[19px] font-bold mt-2">{def.title}</p>
            <p className="mx-muted text-[14px]">{money(price)}</p>
          </div>
        )}

        {!unwrapping && (
          <>
            {upgradeable && (
              <div className="px-4 mt-1">
                <button className="mx-btn w-full" onClick={() => setUpOpen(true)}>
                  <Sparkles size={17} className="inline mr-1.5 -mt-0.5" />Улучшить до NFT · {giftUpgradePrice(def)} 🪙
                </button>
              </div>
            )}
            {canManage && (
              <div className="px-4 mt-2">
                <button className="mx-btn w-full" style={{ background: "var(--mx-surface)", color: "var(--mx-text)" }} onClick={() => setGiveOpen(true)}>
                  <Repeat size={17} className="inline mr-1.5 -mt-0.5" />Передать другому
                </button>
              </div>
            )}

            {curNft ? (
              <div style={{ margin: "12px 16px 0" }}>
                <NftDetails
                  nft={curNft}
                  rows={[["Владелец", mine ? toName : "Вы"], ["От кого", mine ? "Вы" : anonymous ? "Аноним" : senderName], ...(text ? [["Подпись", text] as [string, React.ReactNode]] : [])]}
                  value={curNft.upgraded ? nftValue(curNft, price) : undefined}
                />
              </div>
            ) : (
              <div className="mx-card mx-4 mt-3" style={{ margin: "12px 16px 0" }}>
                <Row k="От кого" v={mine ? "Вы" : anonymous ? "Аноним" : senderName} />
                <Row k="Кому" v={mine ? toName : "Вы"} />
                <Row k="Цена" v={money(price)} />
                {text && <Row k="Подпись" v={text} />}
              </div>
            )}

            <div className="px-4 mt-4"><button className="mx-btn w-full" onClick={onClose}>Закрыть</button></div>
          </>
        )}
      </div>

      {canManage && giftDocId && (
        <UpgradeSheet
          open={upOpen}
          onClose={() => setUpOpen(false)}
          giftDocId={giftDocId}
          def={def}
          onUpgraded={(r: UpgradeResult) => { setUpOpen(false); setNft(r.nft); toast("success", "Подарок улучшен до NFT"); }}
        />
      )}

      <Sheet open={giveOpen} onClose={() => setGiveOpen(false)} zIndex={86}>
        <div className="px-1 pb-3">
          <p className="text-[17px] font-bold px-4 pt-1 pb-2 flex items-center gap-2"><GiftIcon size={18} />Передать подарок</p>
          {giving ? (
            <div className="flex justify-center py-8"><Spinner /></div>
          ) : (
            <RecipientList me={me} onPick={(a) => send(a.uid)} exclude={toUid ? [toUid] : []} />
          )}
        </div>
      </Sheet>
    </Sheet>
  );
}
