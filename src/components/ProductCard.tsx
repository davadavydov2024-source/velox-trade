"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ShoppingCart, Star, Bot, Handshake, Gavel } from "lucide-react";
import { Product, RARITY_LABEL } from "@/types";
import { useCart } from "@/lib/cartStore";
import { useToast } from "@/lib/toastContext";
import { safeImageSrc } from "@/lib/safeImage";
import { getPublicProfileCached, PublicProfile } from "@/lib/sellerCache";
import { FavoriteButton } from "./FavoriteButton";

const RARITY_BORDER: Record<string, string> = {
  common: "border-rarity-common/40",
  uncommon: "border-rarity-uncommon/50",
  rare: "border-rarity-rare/50",
  epic: "border-rarity-epic/50",
  legendary: "border-rarity-legendary/60",
};

export function ProductCard({ product }: { product: Product }) {
  const add = useCart((s) => s.add);
  const { toast } = useToast();
  const [seller, setSeller] = useState<PublicProfile | null>(null);

  useEffect(() => {
    let cancelled = false;
    getPublicProfileCached(product.sellerId).then((p) => {
      if (!cancelled) setSeller(p);
    });
    return () => {
      cancelled = true;
    };
  }, [product.sellerId]);

  const finalPrice = product.discountPercent
    ? +(product.price * (1 - product.discountPercent / 100)).toFixed(2)
    : product.price;

  const isBoosted = (product.boostUntil ?? 0) > Date.now();
  const avgRating = seller?.ratingCount ? (seller.ratingSum ?? 0) / seller.ratingCount : null;

  return (
    <div className={`card p-3 group border ${RARITY_BORDER[product.rarity]} hover:-translate-y-1 ${isBoosted ? "ring-1 ring-accent/60" : ""}`}>
      <Link href={`/product/${product.id}`} className="block relative aspect-square rounded-[12px] overflow-hidden bg-black/30 mb-3">
        <Image
          src={safeImageSrc(product.image)}
          alt={product.name}
          fill
          className="object-contain p-4 transition-transform duration-300 group-hover:scale-110"
          sizes="(max-width: 768px) 50vw, 220px"
        />
        {product.isNew && (
          <span className="absolute top-2 left-2 bg-rarity-rare text-white text-[10px] font-bold px-2 py-1 rounded-md">
            NEW
          </span>
        )}
        {isBoosted && (
          <span className="absolute bottom-2 left-2 bg-accent text-black text-[10px] font-bold px-2 py-1 rounded-md flex items-center gap-1">
            {product.boostTier === "home" ? "⭐ ТОП" : "🚀 В топе"}
          </span>
        )}
        {!!product.discountPercent && (
          <span className="absolute top-2 right-2 bg-accent text-black text-[10px] font-bold px-2 py-1 rounded-md">
            -{product.discountPercent}%
          </span>
        )}
        <div className="absolute bottom-2 right-2">
          <FavoriteButton productId={product.id} />
        </div>
      </Link>

      {/* prefetch={false}: та же ссылка уже прогружается через блок с картинкой чуть выше —
          повторный Link на тот же адрес удваивал бы предзагрузку без всякой пользы. */}
      <Link href={`/product/${product.id}`} prefetch={false}>
        <h3 className="font-medium text-sm truncate hover:text-accent transition-colors">{product.name}</h3>
      </Link>
      <p className="text-xs text-white/40 mb-1 flex items-center gap-1">
        {RARITY_LABEL[product.rarity]}
        <span className="text-white/20">·</span>
        <span className="flex items-center gap-0.5">
          {product.deliveryMethod === "bot" ? <Bot size={11} /> : <Handshake size={11} />}
          {product.deliveryMethod === "bot" ? "Через бота" : "Самовывоз"}
        </span>
      </p>
      {seller?.username && (
        <Link
          href={`/seller/${seller.username}`}
          onClick={(e) => e.stopPropagation()}
          className="flex items-center gap-1.5 mb-2 text-xs text-white/40 hover:text-accent transition-colors"
        >
          <span className="relative w-4 h-4 rounded-full overflow-hidden bg-black/30 shrink-0">
            <Image src={safeImageSrc(seller.photoURL, "/placeholder.svg")} alt="" fill className="object-cover" sizes="16px" />
            {seller.isOnline && (
              <span className="absolute bottom-0 right-0 w-1.5 h-1.5 rounded-full bg-green-400 border border-black/50" />
            )}
          </span>
          <span className="truncate max-w-[80px]">{seller.displayName}</span>
          {avgRating !== null && (
            <span className="flex items-center gap-0.5 text-accent shrink-0">
              <Star size={10} className="fill-accent" /> {avgRating.toFixed(1)}
            </span>
          )}
        </Link>
      )}

      <div className="flex items-center justify-between">
        <div>
          {product.auctionEnabled ? (
            <>
              <span className="text-[10px] text-white/40 block">{product.auctionBidCount ? "Ставка" : "Старт"}</span>
              <span className="font-bold text-accent">{product.auctionCurrentPrice ?? product.auctionStartPrice} ₽</span>
            </>
          ) : (
            <>
              {!!product.discountPercent && (
                <span className="text-xs text-white/40 line-through mr-1">{product.price} ₽</span>
              )}
              <span className="font-bold text-accent">{finalPrice} ₽</span>
            </>
          )}
        </div>
        {product.auctionEnabled ? (
          <Link
            href={`/product/${product.id}`}
            className={`btn-primary py-2 px-3 flex items-center gap-1 text-xs ${product.auctionStatus !== "active" ? "opacity-50" : ""}`}
          >
            <Gavel size={14} /> {product.auctionStatus === "active" ? "Ставка" : "Завершён"}
          </Link>
        ) : (
          <button
            disabled={product.stock <= 0}
            onClick={() => {
              add(product, 1);
              toast("success", `${product.name} добавлен в корзину`);
            }}
            className="btn-primary py-2 px-3 disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="Добавить в корзину"
          >
            <ShoppingCart size={16} />
          </button>
        )}
      </div>
      {!product.auctionEnabled && product.stock <= 0 && <p className="text-xs text-red-400 mt-1">Нет в наличии</p>}
    </div>
  );
}
