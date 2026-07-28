"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Minus, Plus, ShoppingCart, Zap, Star, ShieldCheck } from "lucide-react";
import { getProductById, getProducts } from "@/lib/products";
import { Product, RARITY_LABEL, Review, BADGE_COLOR, BADGE_LABEL, CHECKMARK_BADGES } from "@/types";
import { useCart } from "@/lib/cartStore";
import { useToast } from "@/lib/toastContext";
import { ProductCard } from "@/components/ProductCard";
import { Lightbox } from "@/components/Lightbox";
import { safeImageSrc } from "@/lib/safeImage";
import { getPublicProfileCached, PublicProfile } from "@/lib/sellerCache";
import { getSellerReviews } from "@/lib/reviews";

export default function ProductPage() {
  const { id } = useParams<{ id: string }>();
  const [product, setProduct] = useState<Product | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [qty, setQty] = useState(1);
  const [related, setRelated] = useState<Product[]>([]);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [seller, setSeller] = useState<PublicProfile | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const add = useCart((s) => s.add);
  const { toast } = useToast();

  useEffect(() => {
    getProductById(id)
      .then((p) => {
        if (p) setProduct(p);
        else setNotFound(true);
      })
      .catch(() => setNotFound(true));
  }, [id]);

  useEffect(() => {
    if (!product) return;
    getProducts({ gameId: product.gameId })
      .then((list) => setRelated(list.filter((p) => p.id !== product.id).slice(0, 4)))
      .catch((err) => { console.error("Ошибка загрузки похожих товаров:", err); setRelated([]); });
    getPublicProfileCached(product.sellerId).then(setSeller);
    if (product.sellerId !== "store") {
      getSellerReviews(product.sellerId)
        .then((r) => setReviews(r.slice(0, 5)))
        .catch(() => setReviews([]));
    }
  }, [product]);

  if (notFound) {
    return <div className="max-w-7xl mx-auto px-4 py-20 text-center text-white/40">Товар не найден.</div>;
  }
  if (!product) {
    return <div className="max-w-7xl mx-auto px-4 py-20 text-center text-white/40">Загрузка...</div>;
  }

  const finalPrice = product.discountPercent
    ? +(product.price * (1 - product.discountPercent / 100)).toFixed(2)
    : product.price;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
      <div className="grid md:grid-cols-2 gap-10">
        <div>
          <div
            className="card p-4 aspect-square relative cursor-zoom-in group"
            onClick={() => setLightboxOpen(true)}
          >
            <Image src={safeImageSrc(product.image)} alt={product.name} fill className="object-contain p-2 transition-transform group-hover:scale-[1.03]" sizes="500px" />
          </div>
          {lightboxOpen && (
            <Lightbox src={safeImageSrc(product.image)} alt={product.name} onClose={() => setLightboxOpen(false)} />
          )}

          {seller?.username && (
            <Link href={`/seller/${seller.username}`} className="card p-4 mt-4 flex items-center gap-3 hover:border-accent/40 transition-colors block">
              <div className="relative w-11 h-11 rounded-full overflow-hidden bg-black/30 shrink-0">
                <Image src={safeImageSrc(seller.photoURL, "/placeholder.svg")} alt="" fill className="object-cover" sizes="44px" />
                {seller.isOnline && (
                  <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-green-400 border-2 border-surface" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1">
                  <p className="font-medium text-sm truncate">{seller.displayName}</p>
                  {seller.badges.filter((b) => CHECKMARK_BADGES.includes(b)).map((b) => (
                    <ShieldCheck key={b} size={14} style={{ color: BADGE_COLOR[b] }} aria-label={BADGE_LABEL[b]} />
                  ))}
                </div>
                <p className="text-xs text-white/40">
                  @{seller.username} · {seller.isOnline ? <span className="text-green-400">в сети</span> : "не в сети"}
                </p>
              </div>
              {seller.ratingCount ? (
                <span className="flex items-center gap-1 text-sm text-accent font-medium shrink-0">
                  <Star size={13} className="fill-accent" /> {((seller.ratingSum ?? 0) / seller.ratingCount).toFixed(1)}
                </span>
              ) : (
                <span className="text-xs text-white/30 shrink-0">Нет отзывов</span>
              )}
            </Link>
          )}

          {reviews.length > 0 && (
            <div className="mt-4 space-y-2">
              <p className="text-xs text-white/40">Последние отзывы о продавце</p>
              {reviews.map((r) => (
                <div key={r.id} className="card p-3">
                  <div className="flex items-center justify-between mb-1">
                    <p className="font-medium text-xs">{r.buyerName}</p>
                    <div className="flex gap-0.5">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star key={i} size={10} className={i < r.rating ? "text-accent fill-accent" : "text-white/15"} />
                      ))}
                    </div>
                  </div>
                  {r.text && <p className="text-xs text-white/60">{r.text}</p>}
                </div>
              ))}
              {seller?.username && (
                <Link href={`/seller/${seller.username}`} className="text-xs text-accent hover:underline block text-center pt-1">
                  Все отзывы →
                </Link>
              )}
            </div>
          )}
        </div>

        <div>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-md bg-accent/15 text-accent">
            {RARITY_LABEL[product.rarity]}
          </span>
          <h1 className="text-3xl font-bold mt-3 mb-2">{product.name}</h1>
          <p className="text-white/50 mb-6">{product.description}</p>

          <div className="flex items-baseline gap-3 mb-6">
            {!!product.discountPercent && <span className="text-white/40 line-through">{product.price} ₽</span>}
            <span className="text-3xl font-extrabold text-accent">{finalPrice} ₽</span>
          </div>

          <div className="flex items-center gap-2 mb-6">
            <button
              className="btn-secondary p-2.5"
              onClick={() => setQty((q) => Math.max(1, q - 1))}
              aria-label="Уменьшить количество"
            >
              <Minus size={16} />
            </button>
            <span className="w-12 text-center font-medium">{qty}</span>
            <button
              className="btn-secondary p-2.5"
              onClick={() => setQty((q) => Math.min(product.stock, q + 1))}
              aria-label="Увеличить количество"
            >
              <Plus size={16} />
            </button>
            <span className="text-sm text-white/40 ml-2">Наличие: {product.stock} шт.</span>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/cart"
              onClick={() => add(product, qty)}
              className="btn-primary px-6 py-3 flex items-center gap-2"
            >
              <Zap size={18} /> Купить сейчас
            </Link>
            <button
              onClick={() => {
                add(product, qty);
                toast("success", `${product.name} ×${qty} добавлен в корзину`);
              }}
              className="btn-secondary px-6 py-3 flex items-center gap-2"
              disabled={product.stock <= 0}
            >
              <ShoppingCart size={18} /> В корзину
            </button>
          </div>
        </div>
      </div>

      {related.length > 0 && (
        <section className="mt-16">
          <h2 className="text-xl font-bold mb-4">Похожие товары</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {related.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
