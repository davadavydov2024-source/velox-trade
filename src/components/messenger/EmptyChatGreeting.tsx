"use client";

import { useEffect, useState } from "react";
import { StickerMedia } from "./StickerMedia";
import { useStickerPacks, type StickerPack } from "./StickersUI";

type Pick = { slug: string; i: number; s: StickerPack["stickers"][number] };

/**
 * Пустой личный чат, как в Telegram: «Сообщений пока нет» и случайный стикер-приветствие из твоих наборов.
 * Нажал на стикер — он отправляется первым сообщением. Если наборов нет, показываем просто подсказку.
 */
export function EmptyChatGreeting({ canSend, onSend }: { canSend: boolean; onSend: (slug: string, index: number) => void }) {
  const { packs } = useStickerPacks();
  const [pick, setPick] = useState<Pick | null>(null);

  useEffect(() => {
    if (pick || !packs) return;
    const pool: Pick[] = [];
    for (const p of packs) {
      if (p.locked) continue; // премиум-наборы без Premium отправить нельзя
      p.stickers.forEach((s, i) => { if (s.url) pool.push({ slug: p.slug, i, s }); });
    }
    if (pool.length) setPick(pool[Math.floor(Math.random() * pool.length)]);
  }, [packs, pick]);

  const sticker = pick && (
    <StickerMedia url={pick.s.url} preview={pick.s.preview} kind={pick.s.kind} size="100%" emoji={pick.s.emoji} />
  );

  return (
    <div className="h-full flex items-center justify-center px-6">
      <div className="rounded-2xl px-5 py-4 flex flex-col items-center text-center" style={{ background: "var(--mx-glass)", backdropFilter: "blur(14px)", maxWidth: 270 }}>
        <p className="font-semibold text-[15px]">Сообщений пока нет</p>
        <p className="mx-muted text-[13px] mt-0.5">{canSend ? "Напишите сообщение или нажмите на приветствие ниже" : "Здесь пока ничего нет"}</p>
        {pick && (
          canSend ? (
            <button onClick={() => onSend(pick.slug, pick.i)} className="mt-3 active:scale-95 transition-transform" style={{ width: 128, height: 128 }} aria-label="Отправить приветствие">{sticker}</button>
          ) : (
            <div className="mt-3" style={{ width: 128, height: 128 }}>{sticker}</div>
          )
        )}
      </div>
    </div>
  );
}
