"use client";

import { ReactNode } from "react";
import { EyeOff, Pin } from "lucide-react";
import { NFT_SYMBOL_CHARS, backdropOf, modelOf, symbolOf } from "@/lib/messenger/nft";
import { giftById, type GiftView } from "@/lib/messenger/gifts";
import { NftFigure, hasNftFigure } from "./NftFigures";

/** Узор из мелких символов подарка по плитке — как фон у коллекционных подарков в сетке профиля. */
function TilePattern({ ch }: { ch: string }) {
  const spots: [number, number, number, number][] = [[14, 18, 10, -18], [80, 12, 9, 14], [90, 46, 8, -8], [8, 56, 9, 20], [26, 86, 10, -12], [72, 84, 9, 16], [50, 8, 8, 6], [52, 93, 8, -6], [92, 78, 8, 12]];
  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" aria-hidden>
      {spots.map(([x, y, s, r], i) => <text key={i} x={x} y={y} fontSize={s} textAnchor="middle" dominantBaseline="central" fill="#fff" opacity={0.28} transform={`rotate(${r} ${x} ${y})`}>{ch}</text>)}
    </svg>
  );
}

/** Плитка подарка в профиле: тёмная с узором (коллекционный) или серая (обычный), номер наклонно в углу, булавка / «Скрыт» слева сверху. */
export function GiftTile({ g, mine, onClick, extra }: { g: GiftView; mine: boolean; onClick: () => void; extra?: ReactNode }) {
  const d = giftById(g.giftId);
  if (!d) return null;
  const nft = g.nft;
  const m = nft ? modelOf(nft.model) : null;
  const bd = nft ? backdropOf(nft.backdrop) : null;
  const ch = nft ? NFT_SYMBOL_CHARS[symbolOf(nft.symbol).name] ?? "✦" : "";
  return (
    <button
      onClick={onClick}
      className="relative aspect-square overflow-hidden flex items-center justify-center active:scale-[0.97] transition-transform"
      style={{
        borderRadius: 22,
        opacity: g.hidden && !mine ? 0.45 : 1,
        border: "1px solid rgba(255,255,255,0.09)",
        background: nft ? `radial-gradient(circle at 50% 58%, ${bd!.colors[0]}38 0%, transparent 68%), linear-gradient(160deg, #1d1e25, #0d0e12)` : "rgba(255,255,255,0.09)",
      }}
    >
      {nft && <TilePattern ch={ch} />}
      {nft?.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={nft.imageUrl} alt="" className="relative w-[78%] h-[78%] object-contain" draggable={false} />
      ) : nft && m && hasNftFigure(d.id) ? (
        <svg viewBox="0 0 200 200" className="relative w-[80%] h-[80%]" style={{ filter: "drop-shadow(0 6px 10px rgba(0,0,0,0.5))" }}>
          <g style={{ filter: `hue-rotate(${m.hue}deg) saturate(${m.sat}) brightness(${m.bright ?? 1})`, transform: m.flip ? "scaleX(-1)" : undefined, transformOrigin: "100px 0px", transformBox: "view-box" } as React.CSSProperties}><NftFigure id={d.id} /></g>
        </svg>
      ) : (
        <span className="relative" style={{ fontSize: 50, lineHeight: 1, filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.4))" }}>{d.emoji}</span>
      )}
      {nft && <span className="absolute top-2 right-2.5 text-[12px] font-bold tabular-nums" style={{ color: "rgba(255,255,255,0.78)", transform: "rotate(-12deg)" }}>#{nft.number}</span>}
      {g.hidden ? (
        <span className="absolute top-2 left-2 flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: "rgba(0,0,0,0.6)", color: "#fff", border: "1px solid rgba(255,255,255,0.12)" }}><EyeOff size={11} />Скрыт</span>
      ) : g.pinned ? (
        <span className="absolute top-2 left-2 w-6 h-6 rounded-full flex items-center justify-center" style={{ background: "rgba(0,0,0,0.6)", color: "#fff", border: "1px solid rgba(255,255,255,0.12)" }}><Pin size={12} fill="currentColor" /></span>
      ) : null}
      {g.salePrice ? <span className="absolute bottom-2 left-2 px-2 py-0.5 rounded-full text-[11px] font-bold bg-black/60 text-white">{g.salePrice} ⭐</span> : null}
      {extra}
    </button>
  );
}
