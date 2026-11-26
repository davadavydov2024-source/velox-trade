"use client";

import { useState } from "react";
import { giftById, type GiftNft } from "@/lib/messenger/gifts";
import { GiftMessageCard } from "./Gifts";
import { ClosedBox, GiftReceiveSheet, isGiftMsgOpened } from "./GiftReceive";
import { NftHero } from "./NftHero";

/**
 * Подарок в чате, как в Telegram.
 * • Обычный подарок — карточка с «Открыть» (пока получатель не открыл).
 * • NFT: пока получатель не открыл — закрытая коробка; нажал — распаковка с конфетти и карточка подарка
 *   (фон, узор, модель, номер). Открытую карточку можно нажать ещё раз — полная страница с редкостью, передачей и т. д.
 */
export function GiftChatCard({ msgId, giftId, giftDocId, code, text, price, mine, anonymous, nft, senderName, toName, me, toUid }: {
  msgId: string; giftId: string; giftDocId?: string; code?: string; text?: string; price: number; mine: boolean; anonymous?: boolean;
  nft?: GiftNft; senderName: string; toName: string; me?: string; toUid?: string;
}) {
  const def = giftById(giftId);
  const [open, setOpen] = useState(false);
  const [opened, setOpened] = useState(() => mine || isGiftMsgOpened(msgId));
  if (!def) return null;

  const who = mine ? `Вы отправили подарок — ${toName}` : anonymous ? "Вам отправили подарок" : `${senderName} отправил(а) подарок`;

  return (
    <>
      {!nft ? (
        <GiftMessageCard msgId={msgId} giftId={giftId} text={text} price={price} mine={mine} anonymous={anonymous} senderName={senderName} toName={toName} onOpen={() => setOpen(true)} />
      ) : (
        <div className="flex justify-center my-3">
          <button onClick={() => setOpen(true)} className="mx-gift-tap rounded-2xl overflow-hidden text-left" style={{ width: 250, maxWidth: "76vw" }} aria-label={`${def.title} №${nft.number}`}>
            {opened ? (
              <NftHero
                gift={def}
                nft={nft}
                footer={<span className="inline-block mt-3 text-[13px] font-semibold px-4 py-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.2)" }}>Посмотреть</span>}
              />
            ) : (
              <div className="flex flex-col items-center text-center px-5 py-5 text-white" style={{ background: "radial-gradient(circle at 50% 42%, #3a3f6b, #0b0c14)" }}>
                <p className="text-[13px]" style={{ color: "rgba(255,255,255,0.75)" }}>{who}</p>
                <div className="my-3 mx-nft-float"><ClosedBox size={116} /></div>
                <p className="font-semibold text-[16px]">Коллекционный подарок</p>
                <span className="inline-block mt-3 text-[13px] font-semibold px-4 py-1.5 rounded-full" style={{ background: "var(--mx-accent)", color: "var(--mx-accent-text, #fff)" }}>Открыть</span>
              </div>
            )}
            {text && <p className="px-4 py-2.5 text-[14px] whitespace-pre-wrap" style={{ background: "var(--mx-surface)" }}>{text}</p>}
          </button>
        </div>
      )}
      <GiftReceiveSheet
        open={open}
        onClose={() => setOpen(false)}
        msgId={msgId}
        giftId={giftId}
        giftDocId={giftDocId}
        code={code}
        price={price}
        text={text}
        mine={mine}
        anonymous={anonymous}
        senderName={senderName}
        toName={toName}
        me={me}
        toUid={toUid}
        nft={nft}
        onOpened={() => setOpened(true)}
      />
    </>
  );
}
