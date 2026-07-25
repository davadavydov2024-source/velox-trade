"use client";

import Image from "next/image";
import Link from "next/link";
import { ShoppingCart, Rocket } from "lucide-react";
import { Product } from "@/types";
import { useCart } from "@/lib/cartStore";
import { useToast } from "@/lib/toastContext";
import { safeImageSrc } from "@/lib/safeImage";
import { useLanguage } from "@/lib/languageStore";
import { rarityLabel, tf } from "@/lib/i18n";

const RARITY_BORDER: Record<string, string> = {
  common: "border-rarity-common/40",
  uncommon: "border-rarity-uncommon/50",
  rare: "border-rarity-rare/50",
  epic: "border-rarity-epic/50",
  legendary: "border-rarity-legendary/60",
};

export function ProductCard({ product }: { product: Product }) {
  const { t, language } = useLanguage();
  const add = useCart((s) => s.add);
  const { toast } = useToast();

  const finalPrice = product.discountPercent
    ? +(product.price * (1 - product.discountPercent / 100)).toFixed(2)
    : product.price;
  const isBoosted = (product.boostUntil ?? 0) > Date.now();

  return (
    <div className={`card p-3 group border ${RARITY_BORDER[product.rarity]} hover:-translate-y-1`}>
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
        {!!product.discountPercent && (
          <span className="absolute top-2 right-2 bg-accent text-black text-[10px] font-bold px-2 py-1 rounded-md">
            -{product.discountPercent}%
          </span>
        )}
        {isBoosted && (
          <span className="absolute bottom-2 left-2 bg-black/70 text-accent text-[10px] font-bold px-2 py-1 rounded-md flex items-center gap-1">
            <Rocket size={10} /> {t("catalog_boosted_badge")}
          </span>
        )}
      </Link>

      <Link href={`/product/${product.id}`}>
        <h3 className="font-medium text-sm truncate hover:text-accent transition-colors">{product.name}</h3>
      </Link>
      <p className="text-xs text-white/40 mb-2">{rarityLabel(language, product.rarity)}</p>

      <div className="flex items-center justify-between">
        <div>
          {!!product.discountPercent && (
            <span className="text-xs text-white/40 line-through mr-1">{product.price} ₽</span>
          )}
          <span className="font-bold text-accent">{finalPrice} ₽</span>
        </div>
        <button
          disabled={product.stock <= 0}
          onClick={() => {
            add(product, 1);
            toast("success", tf(language, "product_added_to_cart", { name: product.name, qty: 1 }));
          }}
          className="btn-primary py-2 px-3 disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label={t("product_add_to_cart")}
        >
          <ShoppingCart size={16} />
        </button>
      </div>
      {product.stock <= 0 && <p className="text-xs text-red-400 mt-1">{t("product_out_of_stock")}</p>}
    </div>
  );
}
