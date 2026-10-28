"use client";

import { isPremium } from "@/lib/messenger/premium";
import { giftById } from "@/lib/messenger/gifts";
import type { MAccount } from "./mtypes";
import { NftArt } from "./Gifts";

/** Статус рядом с ником (как эмодзи-статус в Telegram): эмодзи или NFT-подарок. Виден, пока у владельца активен Premium. */
export function StatusBadge({ acc, size = 16 }: { acc: MAccount | null | undefined; size?: number }) {
  const st = acc?.status;
  if (!st || !isPremium(acc)) return null;
  if (st.kind === "emoji") return <span className="shrink-0 leading-none" style={{ fontSize: size }} aria-hidden>{st.emoji}</span>;
  const g = giftById(st.giftId);
  if (!g) return null;
  return <span className="shrink-0 inline-flex" style={{ width: size + 2, height: size + 2 }}><NftArt gift={g} nft={st.nft} size="100%" motion="off" /></span>;
}
