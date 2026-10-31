"use client";

import { useEffect, useState } from "react";
import { authedFetch } from "@/lib/authedFetch";
import { GIFTS, giftById } from "@/lib/messenger/gifts";
import { GiftArt } from "./Gifts";
import { NFT_TIERS, type NftTierId } from "@/lib/messenger/nft";
import { Spinner } from "./ui";

type Data = {
  scanned: number;
  total: number;
  byGift: { giftId: string; count: number }[];
  tiers: Record<string, number>;
  stock?: Record<string, number>;
  rare: { id: string; giftId: string; number: number; supply: number; tier: NftTierId; chance: number; owner: { uid: string; displayName: string; handle: string } }[];
};

/** Вкладка «NFT» в админ-панели: сколько NFT выдано, раскладка по редкости, самые редкие экземпляры. */
export function AdminNft() {
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    authedFetch("/api/admin/messenger/nft")
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || "Не удалось загрузить");
        setData(d as Data);
      })
      .catch((e) => setErr(e.message || "Ошибка"));
  }, []);

  if (err) return <p className="mx-muted text-[14px] text-center py-8">{err}</p>;
  if (!data) return <div className="flex justify-center py-10"><Spinner /></div>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="mx-card px-4 py-3"><p className="text-[26px] font-bold leading-none">{data.total}</p><p className="mx-muted text-[13px] mt-1">NFT среди последних {data.scanned} подарков</p></div>
        <div className="mx-card px-4 py-3"><p className="text-[26px] font-bold leading-none">{data.byGift.length}</p><p className="mx-muted text-[13px] mt-1">видов NFT выдано</p></div>
      </div>

      <div className="mx-card">
        <p className="px-4 pt-3 pb-1 text-[13px] uppercase tracking-wide mx-muted">Тиражи (продано / лимит)</p>
        {[...GIFTS.filter((g) => g.nft && g.limited)].sort((a, b) => Number(b.category === "halloween") - Number(a.category === "halloween")).map((g) => {
          const sold = data.stock?.[g.id] ?? 0;
          const left = Math.max(0, (g.limited ?? 0) - sold);
          const pct = Math.min(100, Math.round((sold / (g.limited || 1)) * 100));
          return (
            <div key={g.id} className="px-4 py-2 flex items-center gap-3">
              <GiftArt gift={g} size={38} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between text-[14px]">
                  <span className="truncate">{g.title}{g.category === "halloween" ? " 🎃" : ""}</span>
                  <span className="font-semibold shrink-0 ml-2">{sold}/{g.limited}</span>
                </div>
                <div className="h-1.5 rounded-full mt-1.5 overflow-hidden" style={{ background: "var(--mx-surface2)" }}>
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: left === 0 ? "var(--mx-danger)" : "var(--mx-accent)" }} />
                </div>
                <p className="mx-muted text-[11.5px] mt-0.5">{left === 0 ? "Распродано" : `Осталось ${left}`}</p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mx-card">
        <p className="px-4 pt-3 pb-1 text-[13px] uppercase tracking-wide mx-muted">По редкости</p>
        {(Object.keys(NFT_TIERS) as NftTierId[]).map((t) => (
          <div key={t} className="px-4 py-1.5 flex items-center justify-between text-[14.5px]">
            <span style={{ color: NFT_TIERS[t].color }}>● {NFT_TIERS[t].label}</span>
            <span className="font-semibold">{data.tiers[t] ?? 0}</span>
          </div>
        ))}
      </div>

      <div className="mx-card">
        <p className="px-4 pt-3 pb-1 text-[13px] uppercase tracking-wide mx-muted">Самые редкие</p>
        {data.rare.length === 0 && <p className="px-4 py-3 mx-muted text-[14px]">Пока нет NFT.</p>}
        {data.rare.map((r) => {
          const g = giftById(r.giftId);
          const pct = r.chance * 100;
          return (
            <div key={r.id} className="px-4 py-2 flex items-center gap-3">
              {g ? <GiftArt gift={g} size={36} /> : <span style={{ fontSize: 26 }}>🎁</span>}
              <div className="min-w-0 flex-1">
                <p className="text-[14.5px] font-semibold truncate">{g?.title ?? r.giftId} #{r.number}/{r.supply}</p>
                <p className="mx-muted text-[12.5px] truncate">{r.owner.handle ? `@${r.owner.handle}` : r.owner.displayName || r.owner.uid.slice(0, 8)}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-[13px] font-semibold" style={{ color: NFT_TIERS[r.tier]?.color }}>{NFT_TIERS[r.tier]?.label}</p>
                <p className="mx-muted text-[12px]">{pct < 0.01 ? pct.toFixed(4) : pct.toFixed(3)}%</p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mx-card">
        <p className="px-4 pt-3 pb-1 text-[13px] uppercase tracking-wide mx-muted">Выдано по видам</p>
        {data.byGift.map((b) => {
          const g = giftById(b.giftId);
          return (
            <div key={b.giftId} className="px-4 py-1.5 flex items-center justify-between text-[14.5px]">
              <span>{g?.emoji ?? "🎁"} {g?.title ?? b.giftId}</span>
              <span className="font-semibold">{b.count}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
