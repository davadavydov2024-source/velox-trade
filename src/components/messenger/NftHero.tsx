"use client";

import { ReactNode } from "react";
import { NFT_SYMBOL_CHARS, NFT_TIERS, backdropOf, isSpecialNumber, modelOf, nftTier, rarityPct, symbolOf } from "@/lib/messenger/nft";
import type { GiftDef, GiftNft } from "@/lib/messenger/gifts";
import { NftFigure, hasNftFigure } from "./NftFigures";

/**
 * Верх страницы коллекционного подарка как в Telegram: фон из радиального градиента цвета подарка,
 * узор из его символа кольцами, крупная фигурка по центру, название и номер. Без свечения, бликов и рамок.
 */
export function NftHero({ gift, nft }: { gift: GiftDef; nft: GiftNft }) {
  const b = backdropOf(nft.backdrop);
  const m = modelOf(nft.model);
  const ch = NFT_SYMBOL_CHARS[symbolOf(nft.symbol).name] ?? "✦";
  const tier = nftTier(nft);
  const filterAnim = m.anim === "rainbow" || m.anim === "holo" || m.anim === "shimmer" || m.anim === "flame" || m.anim === "aurora";
  const moveAnim = m.anim === "pulse" || m.anim === "glitch" || m.anim === "spin";
  const figureStyle = {
    ...(filterAnim ? { ["--nft-sat" as string]: String(m.sat), ["--nft-hue" as string]: String(m.hue) } : { filter: `hue-rotate(${m.hue}deg) saturate(${m.sat}) brightness(${m.bright ?? 1}) drop-shadow(0 8px 14px rgba(0,0,0,.4))` }),
    transform: m.flip ? "scaleX(-1)" : undefined,
    transformOrigin: "100px 0px",
    transformBox: "view-box",
  } as unknown as React.CSSProperties;

  const rings: [number, number, number, number][] = [[70, 6, 26, 0.2], [112, 10, 22, 0.14], [156, 14, 20, 0.1], [204, 18, 18, 0.07]];
  const marks: ReactNode[] = [];
  rings.forEach(([r, n, size, op], ri) => {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + ri * 0.4;
      const x = 200 + Math.cos(a) * r * 1.5;
      const y = 128 + Math.sin(a) * r * 0.8;
      marks.push(<text key={`${ri}-${i}`} x={x} y={y} fontSize={size} textAnchor="middle" dominantBaseline="central" fill="#fff" opacity={op} transform={`rotate(${((i * 53 + ri * 17) % 70) - 35} ${x} ${y})`}>{ch}</text>);
    }
  });

  return (
    <div className="relative text-white" style={{ background: `radial-gradient(circle at 50% 42%, ${b.colors[0]} 0%, ${b.colors[1]} 100%)` }}>
      {tier !== "common" && (
        <span className="absolute left-3 top-3 z-[1] text-[12px] font-semibold px-2.5 py-1 rounded-full" style={{ background: "rgba(0,0,0,0.28)" }}>{NFT_TIERS[tier].label}</span>
      )}
      <svg viewBox="0 0 400 250" className="block w-full" style={{ maxHeight: 300 }} role="img" aria-label={`${gift.title} №${nft.number}`}>
        {marks}
        <svg x="110" y="18" width="180" height="180" viewBox="0 0 200 200" overflow="visible">
          <g className="mx-nft-float">
            <g className={moveAnim ? `mx-nft-${m.anim}` : undefined}>
              {hasNftFigure(gift.id)
                ? <g className={filterAnim ? `mx-nft-${m.anim}` : undefined} style={figureStyle}><NftFigure id={gift.id} /></g>
                : <text x="100" y="124" fontSize="88" textAnchor="middle" className={filterAnim ? `mx-nft-${m.anim}` : undefined} style={figureStyle}>{gift.emoji}</text>}
            </g>
          </g>
        </svg>
      </svg>
      <div className="relative text-center px-6 pb-5 -mt-3">
        <p className="text-[24px] font-bold leading-tight">{gift.title}</p>
        <p className="text-[14px] mt-0.5" style={{ color: "rgba(255,255,255,0.78)" }}>{nft.upgraded ? `#${nft.number}` : `Коллекционный подарок · #${nft.number}`}</p>
      </div>
      <div className="absolute inset-x-0 bottom-0 h-16 pointer-events-none" style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0), rgba(0,0,0,0.22))" }} />
    </div>
  );
}

function PctChip({ r }: { r: number }) {
  return <span className="text-[12px] font-medium px-1.5 py-0.5 rounded-md" style={{ background: "color-mix(in srgb, var(--mx-accent) 16%, transparent)", color: "var(--mx-accent)" }}>{rarityPct(r)}</span>;
}

/** Таблица свойств коллекционного подарка: владелец и данные, затем модель / фон / символ с процентом редкости, тираж. */
export function NftDetails({ nft, rows = [], issued, value }: { nft: GiftNft; rows?: [string, ReactNode][]; issued?: number; value?: number }) {
  const attrs: [string, string, number][] = [
    ["Модель", nft.model, modelOf(nft.model).rarity],
    ["Фон", nft.backdrop, backdropOf(nft.backdrop).rarity],
    ["Символ", nft.symbol, symbolOf(nft.symbol).rarity],
  ];
  const special = isSpecialNumber(nft.number, nft.supply);
  return (
    <div className="mx-card w-full">
      {rows.map(([k, v]) => (
        <div key={k} className="flex items-center justify-between gap-4 px-4 py-2.5"><span className="mx-muted">{k}</span><span className="text-right min-w-0 truncate">{v}</span></div>
      ))}
      {attrs.map(([k, v, r]) => (
        <div key={k} className="flex items-center justify-between gap-4 px-4 py-2.5"><span className="mx-muted">{k}</span><span className="flex items-center gap-2 min-w-0"><span className="truncate">{v}</span><PctChip r={r} /></span></div>
      ))}
      {nft.upgraded ? (
        <>
          <div className="flex items-center justify-between gap-4 px-4 py-2.5"><span className="mx-muted">Выпущено</span><span>{(issued ?? nft.number).toLocaleString("ru-RU")}{special && <span className="ml-2 text-[12px] font-medium px-1.5 py-0.5 rounded-md" style={{ background: "rgba(255,180,0,0.16)", color: "#e0a000" }}>особый номер</span>}</span></div>
          {value ? <div className="flex items-center justify-between gap-4 px-4 py-2.5"><span className="mx-muted">Ценность</span><span>~ {value} 🪙</span></div> : null}
          <div className="flex items-center justify-between gap-4 px-4 py-2.5"><span className="mx-muted">Улучшен</span><span>{new Date(nft.upAt ?? 0).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })} · {nft.upPrice ?? 0} 🪙</span></div>
        </>
      ) : (
      <div className="flex items-center justify-between gap-4 px-4 py-2.5">
        <span className="mx-muted">Тираж</span>
        <span>#{nft.number} из {nft.supply.toLocaleString("ru-RU")}{special && <span className="ml-2 text-[12px] font-medium px-1.5 py-0.5 rounded-md" style={{ background: "rgba(255,180,0,0.16)", color: "#e0a000" }}>особый номер</span>}</span>
      </div>
      )}
    </div>
  );
}
