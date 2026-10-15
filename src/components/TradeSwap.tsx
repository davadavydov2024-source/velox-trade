"use client";

import Image from "next/image";
import { ArrowLeftRight, Package, Plus } from "lucide-react";
import { safeImageSrc, isValidImageSrc } from "@/lib/safeImage";

function ItemTile({
  name,
  image,
  label,
  tone,
  size,
}: {
  name: string;
  image?: string | null;
  label: string;
  tone: "give" | "get";
  size: "md" | "sm";
}) {
  const box = size === "md" ? "w-20 h-20 sm:w-24 sm:h-24" : "w-14 h-14";
  const glow = tone === "give" ? "from-accent/30" : "from-[#4a6cf7]/30";
  const ring = tone === "give" ? "ring-accent/40" : "ring-[#4a6cf7]/40";
  return (
    <div className="flex flex-col items-center text-center min-w-0 flex-1 gap-1.5">
      <p className={`text-[10px] uppercase tracking-wider font-semibold ${tone === "give" ? "text-accent/80" : "text-[#7b93ff]"}`}>{label}</p>
      <div className="relative">
        <div className={`absolute inset-0 rounded-2xl bg-gradient-to-b ${glow} to-transparent blur-xl opacity-70`} />
        <div className={`relative ${box} rounded-2xl bg-black/40 ring-1 ${ring} overflow-hidden flex items-center justify-center`}>
          {isValidImageSrc(image) ? (
            <Image src={safeImageSrc(image)} alt={name} fill className="object-contain p-2" sizes="96px" />
          ) : (
            <Package size={size === "md" ? 28 : 20} className="text-white/25" />
          )}
        </div>
      </div>
      <p className={`font-medium leading-tight line-clamp-2 w-full ${size === "md" ? "text-sm" : "text-xs"}`}>{name}</p>
    </div>
  );
}

/**
 * Визуальный «обмен»: два предмета с подсветкой и круглой кнопкой-стрелкой посередине.
 * Используется на странице «Обмены» и в админке сделок.
 */
export function TradeSwap({
  giveName,
  giveImage,
  giveLabel,
  getName,
  getImage,
  getLabel,
  extra,
  size = "md",
}: {
  giveName: string;
  giveImage?: string | null;
  giveLabel: string;
  getName: string;
  getImage?: string | null;
  getLabel: string;
  /** Доплата в рублях (если есть) — показывается плашкой под стрелкой. */
  extra?: number;
  size?: "md" | "sm";
}) {
  return (
    <div className="flex items-start justify-center gap-2 sm:gap-4 w-full">
      <ItemTile name={giveName} image={giveImage} label={giveLabel} tone="give" size={size} />
      <div className={`flex flex-col items-center shrink-0 ${size === "md" ? "pt-9 sm:pt-11" : "pt-6"} gap-1.5`}>
        <div
          className={`${size === "md" ? "w-9 h-9" : "w-7 h-7"} rounded-full flex items-center justify-center text-black`}
          style={{ background: "linear-gradient(135deg, var(--color-accent), #4a6cf7)" }}
        >
          <ArrowLeftRight size={size === "md" ? 16 : 13} strokeWidth={2.5} />
        </div>
        {!!extra && (
          <span className="flex items-center gap-0.5 text-[10px] font-bold text-accent bg-accent/10 border border-accent/30 rounded-full px-1.5 py-0.5 whitespace-nowrap">
            <Plus size={9} /> {extra} ₽
          </span>
        )}
      </div>
      <ItemTile name={getName} image={getImage} label={getLabel} tone="get" size={size} />
    </div>
  );
}
