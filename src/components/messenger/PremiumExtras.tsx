"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/lib/toastContext";
import { PREMIUM_PERKS, STATUS_EMOJIS } from "@/lib/messenger/premium";
import { giftById, type GiftView } from "@/lib/messenger/gifts";
import { mApi, MApiError } from "./api";
import { NftArt } from "./Gifts";
import { StatusBadge } from "./StatusBadge";
import type { MAccount } from "./mtypes";

/** Плюсы Mili Premium списком — как на экране подписки в Telegram. */
export function PerksList() {
  return (
    <div className="mx-card">
      <p className="px-4 pt-3 pb-1 text-[13px] uppercase tracking-wide mx-muted">Что даёт Premium</p>
      {PREMIUM_PERKS.map((p) => (
        <div key={p.title} className="flex gap-3 px-4 py-3">
          <span className="text-[26px] leading-none shrink-0 w-8 text-center">{p.icon}</span>
          <div className="min-w-0">
            <p className="font-semibold text-[15.5px]">{p.title}</p>
            <p className="mx-muted text-[14px] leading-snug">{p.text}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Выбор статуса рядом с ником: эмодзи или один из моих NFT-подарков. */
export function StatusPicker({ account, premium }: { account: MAccount; premium: boolean }) {
  const { toast } = useToast();
  const [nfts, setNfts] = useState<GiftView[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    mApi<{ gifts: GiftView[] }>("gifts?uid=me").then((d) => setNfts(d.gifts.filter((g) => g.nft))).catch(() => {});
  }, []);

  const set = async (status: unknown) => {
    if (busy) return;
    setBusy(true);
    try { await mApi("profile", { status }); } catch (e) { toast("error", e instanceof MApiError ? e.message : "Не получилось"); } finally { setBusy(false); }
  };
  const cur = account.status;
  const isEmoji = (e: string) => cur?.kind === "emoji" && cur.emoji === e;
  const isNft = (id: string) => cur?.kind === "nft" && cur.giftDocId === id;

  return (
    <div className="mx-card">
      <div className="flex items-center justify-between px-4 pt-3 pb-1">
        <p className="text-[13px] uppercase tracking-wide mx-muted">Статус рядом с ником</p>
        {cur && <button className="text-[13.5px]" style={{ color: "var(--mx-accent)" }} onClick={() => set(null)}>Убрать</button>}
      </div>
      <p className="px-4 pb-2 text-[15px] flex items-center gap-1.5">{account.displayName} <StatusBadge acc={{ ...account, premiumUntil: account.premiumUntil ?? 0 }} size={18} /></p>
      {!premium ? (
        <p className="mx-muted text-[14px] px-4 pb-4">Статус можно поставить с активным Mili Premium.</p>
      ) : (
        <div className="px-3 pb-3">
          <div className="grid grid-cols-6 gap-1.5">
            {STATUS_EMOJIS.map((e) => (
              <button key={e} onClick={() => set({ kind: "emoji", emoji: e })} className="aspect-square rounded-xl text-[24px] active:scale-90 transition-transform" style={{ background: isEmoji(e) ? "color-mix(in srgb, var(--mx-accent) 25%, transparent)" : "var(--mx-surface2)", outline: isEmoji(e) ? "2px solid var(--mx-accent)" : "none" }}>{e}</button>
            ))}
          </div>
          <p className="mx-muted text-[13px] mt-3 mb-1.5">Мои NFT-подарки</p>
          {nfts.length === 0 ? (
            <p className="mx-muted text-[13.5px]">Пока нет — NFT можно купить в магазине подарков (вкладка «✨ NFT»).</p>
          ) : (
            <div className="grid grid-cols-4 gap-2">
              {nfts.map((g) => {
                const d = giftById(g.giftId);
                if (!d || !g.nft) return null;
                return (
                  <button key={g.id} onClick={() => set({ kind: "nft", giftDocId: g.id })} className="rounded-2xl overflow-hidden active:scale-95 transition-transform" style={{ outline: isNft(g.id) ? "2.5px solid var(--mx-accent)" : "none", outlineOffset: 2 }}>
                    <NftArt gift={d} nft={g.nft} size="100%" />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
