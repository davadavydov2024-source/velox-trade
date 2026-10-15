"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ShoppingCart, Star } from "lucide-react";
import { Product, RARITY_LABEL, getPaymentMode } from "@/types";
import { useCart } from "@/lib/cartStore";
import { useToast } from "@/lib/toastContext";
import { safeImageSrc } from "@/lib/safeImage";
import { getPublicProfileCached, PublicProfile } from "@/lib/sellerCache";
import { StyledNickname } from "./StyledNickname";
import { FavoriteButton } from "./FavoriteButton";

const RARITY_BAR: Record<string, string> = {
  common: "#8a93a3",
  uncommon: "#4cc26b",
  rare: "#3b9cff",
  epic: "#b266ff",
  legendary: "#ffb020",
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

  const paymentMode = getPaymentMode(product);
  const starsOnly = paymentMode === "stars";
  const isBoosted = (product.boostUntil ?? 0) > Date.now();
  const avgRating = seller?.ratingCount ? (seller.ratingSum ?? 0) / seller.ratingCount : null;

  return (
    <div className={`group flex flex-col rounded-[16px] bg-surface border ${isBoosted ? "border-accent/60" : "border-border hover:border-white/20"} overflow-hidden transition-colors`}>
      <Link href={`/product/${product.id}`} className="block relative aspect-square bg-[#0f1116]">
        <Image
          src={safeImageSrc(product.image)}
          alt={product.name}
          fill
          className="object-contain p-5 transition-transform duration-200 group-hover:scale-[1.04]"
          sizes="(max-width: 768px) 50vw, 220px"
        />
        <span className="absolute left-0 right-0 bottom-0 h-[3px]" style={{ background: RARITY_BAR[product.rarity] }} />
        <div className="absolute top-2 left-2 flex flex-col items-start gap-1">
          {product.isNew && <span className="bg-white text-black text-[10px] font-bold px-1.5 py-0.5 rounded-[6px] tracking-wide">NEW</span>}
          {isBoosted && (
            <span className="bg-accent text-black text-[10px] font-bold px-1.5 py-0.5 rounded-[6px]">
              {product.boostTier === "home" ? "ТОП" : "В топе"}
            </span>
          )}
        </div>
        <div className="absolute top-2 right-2 flex flex-col items-end gap-1">
          {!!product.discountPercent && (
            <span className="bg-[#ff4d4f] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-[6px]">-{product.discountPercent}%</span>
          )}
          {paymentMode !== "rub" && !!product.starsPrice && (
            <span className="bg-[#229ed9] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-[6px]">⭐ Stars</span>
          )}
        </div>
        <div className="absolute bottom-2.5 right-2">
          <FavoriteButton productId={product.id} />
        </div>
      </Link>

      <div className="p-3 flex flex-col flex-1">
        {/* prefetch={false}: та же ссылка уже прогружается через блок с картинкой выше. */}
        <Link href={`/product/${product.id}`} prefetch={false}>
          <h3 className="font-medium text-[13.5px] leading-snug line-clamp-2 min-h-[2.5em] hover:text-accent transition-colors">{product.name}</h3>
        </Link>
        <p className="text-[11px] mt-1" style={{ color: RARITY_BAR[product.rarity] }}>{RARITY_LABEL[product.rarity]}</p>

        {seller?.username && (
          <Link
            href={`/seller/${seller.username}`}
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1.5 mt-2 text-xs text-white/45 hover:text-white transition-colors"
          >
            <span className="relative w-4 h-4 rounded-full overflow-hidden bg-black/30 shrink-0">
              <Image src={safeImageSrc(seller.photoURL, "/placeholder.svg")} alt="" fill className="object-cover" sizes="16px" />
              {seller.isOnline && <span className="absolute bottom-0 right-0 w-1.5 h-1.5 rounded-full bg-green-400 border border-black/50" />}
            </span>
            <span className="truncate max-w-[84px]">
              <StyledNickname name={seller.displayName} nameColor={seller.nameColor} nameFont={seller.nameFont} />
            </span>
            {avgRating !== null && (
              <span className="flex items-center gap-0.5 text-white/70 shrink-0">
                <Star size={10} className="fill-accent text-accent" /> {avgRating.toFixed(1)}
              </span>
            )}
          </Link>
        )}

        <div className="flex items-end justify-between gap-2 mt-auto pt-3">
          <div className="leading-none">
            {starsOnly ? (
              <span className="font-display text-[17px] font-semibold">{product.starsPrice} ⭐</span>
            ) : (
              <>
                {!!product.discountPercent && <span className="block text-[11px] text-white/35 line-through mb-0.5">{product.price} ₽</span>}
                <span className="font-display text-[17px] font-semibold">{finalPrice} ₽</span>
              </>
            )}
          </div>
          {starsOnly ? (
            <Link href={`/product/${product.id}`} className="btn-primary py-2 px-3.5 text-xs" aria-label="Открыть товар">
              Купить
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
        {product.stock <= 0 && <p className="text-xs text-red-400 mt-1.5">Нет в наличии</p>}
      </div>
    </div>
  );
}
