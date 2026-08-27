"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { ShoppingBag, Disc3 } from "lucide-react";
import { subscribeLiveActivity } from "@/lib/publicActivity";
import { PublicActivityItem } from "@/types";
import { safeImageSrc, isValidImageSrc } from "@/lib/safeImage";

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "только что";
  if (s < 3600) return `${Math.floor(s / 60)} мин назад`;
  if (s < 86400) return `${Math.floor(s / 3600)} ч назад`;
  return `${Math.floor(s / 86400)} дн назад`;
}

function ActivityCard({ item }: { item: PublicActivityItem }) {
  const [, force] = useState(0);
  // Обновляем подпись "N мин назад" раз в минуту, не дожидаясь новых покупок.
  useEffect(() => {
    const t = setInterval(() => force((v) => v + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="flex-none w-64 card p-3 flex items-center gap-3">
      <div className="w-11 h-11 rounded-btn bg-black/30 overflow-hidden shrink-0 relative flex items-center justify-center">
        {item.image && isValidImageSrc(item.image) ? (
          <Image src={safeImageSrc(item.image)} alt="" fill className="object-cover" sizes="44px" />
        ) : (
          <ShoppingBag size={18} className="text-white/30" />
        )}
        {item.type === "wheel" && (
          <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-accent flex items-center justify-center">
            <Disc3 size={10} className="text-black" />
          </span>
        )}
      </div>
      <div className="min-w-0">
        <p className="text-xs text-white/40 truncate">
          <span className="text-white/70 font-medium">{item.buyerNickMasked}</span>{" "}
          {item.type === "wheel" ? "выиграл(а)" : "купил(а)"}
        </p>
        <p className="text-sm font-medium truncate">{item.productName}</p>
        <p className="text-[11px] text-accent">
          {item.price > 0 ? `${item.price} ₽` : "приз"} · {timeAgo(item.createdAt)}
        </p>
      </div>
    </div>
  );
}

export function LiveActivityFeed() {
  const [items, setItems] = useState<PublicActivityItem[]>([]);

  useEffect(() => {
    const unsub = subscribeLiveActivity(setItems, 16);
    return unsub;
  }, []);

  if (items.length === 0) return null;

  // Дублируем список — бесконечная лента без видимого "шва" (marquee едет ровно на половину ширины).
  const track = [...items, ...items];

  return (
    <div className="overflow-hidden -mx-4 sm:-mx-6 px-4 sm:px-6">
      <p className="text-xs text-white/40 font-medium mb-2.5">🔥 Покупают прямо сейчас</p>
      <div className="flex gap-3 activity-marquee-track" style={{ width: "max-content" }}>
        {track.map((item, i) => (
          <ActivityCard key={`${item.id}-${i}`} item={item} />
        ))}
      </div>
    </div>
  );
}
