"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Minus, Plus, ShoppingCart, Zap, Star, ShieldCheck, ArrowLeftRight } from "lucide-react";
import { getProducts, getGameBySlug, getPurchasableProductById } from "@/lib/products";
import { Product, RARITY_LABEL, Review, BADGE_COLOR, BADGE_LABEL, CHECKMARK_BADGES } from "@/types";
import { useCart } from "@/lib/cartStore";
import { useToast } from "@/lib/toastContext";
import { useAuth } from "@/lib/authContext";
import { ProductCard } from "@/components/ProductCard";
import { Lightbox } from "@/components/Lightbox";
import { FavoriteButton } from "@/components/FavoriteButton";
import { TradeOfferModal } from "@/components/TradeOfferModal";
import { safeImageSrc } from "@/lib/safeImage";
import { getPublicProfileCached, PublicProfile } from "@/lib/sellerCache";
import { getSellerReviews } from "@/lib/reviews";
import { addRecentlyViewed } from "@/lib/recentlyViewed";
import { RecentlyViewedSection } from "@/components/RecentlyViewedSection";
import { getPriceHistory, PricePoint } from "@/lib/priceHistory";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

import { RARITY_COLOR } from "@/lib/rarityColors";

export default function ProductPage() {
  const { id } = useParams<{ id: string }>();
  const [product, setProduct] = useState<Product | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [qty, setQty] = useState(1);
  const [related, setRelated] = useState<Product[]>([]);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [seller, setSeller] = useState<PublicProfile | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [gameName, setGameName] = useState<string | null>(null);
  const [priceHistory, setPriceHistory] = useState<PricePoint[]>([]);
  const add = useCart((s) => s.add);
  const { toast } = useToast();
  const { user } = useAuth();
  const [tradeModalOpen, setTradeModalOpen] = useState(false);

  useEffect(() => {
    // getPurchasableProductById (не обычный getProductById!) — если товар сейчас "заперт" под
    // колесо фортуны, страница должна вести себя как "товар не найден", а не давать купить его
    // напрямую по прямой ссылке в обход колеса.
    getPurchasableProductById(id)
      .then((p) => {
        if (p) {
          setProduct(p);
          addRecentlyViewed(p.id);
        } else setNotFound(true);
      })
      .catch(() => setNotFound(true));
  }, [id]);

  useEffect(() => {
    if (!product) return;
    getProducts({ gameId: product.gameId, excludeWheelLocked: true })
      .then((list) => setRelated(list.filter((p) => p.id !== product.id).slice(0, 4)))
      .catch((err) => { console.error("Ошибка загрузки похожих товаров:", err); setRelated([]); });
    getPublicProfileCached(product.sellerId).then(setSeller);
    getGameBySlug(product.gameId).then((g) => setGameName(g?.name ?? null)).catch(() => setGameName(null));
    getPriceHistory(product.id).then(setPriceHistory).catch(() => setPriceHistory([]));
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
            style={{ borderColor: `${RARITY_COLOR[product.rarity]}80` }}
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
                // prefetch={false}: та же ссылка на профиль продавца уже прогружается блоком выше.
                <Link href={`/seller/${seller.username}`} prefetch={false} className="text-xs text-accent hover:underline block text-center pt-1">
                  Все отзывы →
                </Link>
              )}
            </div>
          )}
        </div>

        <div>
          {gameName && (
            <Link href={`/catalog?game=${product.gameId}`} className="text-xs text-white/40 hover:text-accent mb-2 inline-block">
              {gameName} →
            </Link>
          )}
          <span
            className="text-xs font-semibold px-2.5 py-1 rounded-md block w-fit"
            style={{ background: `${RARITY_COLOR[product.rarity]}22`, color: RARITY_COLOR[product.rarity] }}
          >
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
            <FavoriteButton
              productId={product.id}
              className="btn-secondary px-4 py-3 flex items-center gap-2"
            />
            {user && product.sellerId !== "store" && product.sellerId !== user.uid && (
              <button
                onClick={() => setTradeModalOpen(true)}
                className="btn-secondary px-4 py-3 flex items-center gap-2"
                title="Предложить обмен своим товаром"
              >
                <ArrowLeftRight size={18} /> Обмен
              </button>
            )}
          </div>
        </div>
      </div>

      {tradeModalOpen && product && <TradeOfferModal targetProduct={product} onClose={() => setTradeModalOpen(false)} />}

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

      {priceHistory.length >= 2 && (
        <section className="mt-16 card p-5">
          <h2 className="text-lg font-bold mb-4">История цены</h2>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={priceHistory}>
              <XAxis
                dataKey="at"
                tickFormatter={(v) => new Date(v).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" })}
                stroke="#5b6272"
                fontSize={11}
                tickLine={false}
                axisLine={false}
              />
              <YAxis stroke="#5b6272" fontSize={11} tickLine={false} axisLine={false} width={50} />
              <Tooltip
                formatter={(v: number) => [`${v} ₽`, "Цена"]}
                labelFormatter={(v) => new Date(v).toLocaleDateString("ru-RU")}
                contentStyle={{ background: "#151922", border: "1px solid #232838", borderRadius: 8, fontSize: 12 }}
              />
              <Line type="monotone" dataKey="price" stroke="#ff9800" strokeWidth={2} dot={{ r: 3, fill: "#ff9800" }} />
            </LineChart>
          </ResponsiveContainer>
        </section>
      )}

      <RecentlyViewedSection excludeId={product.id} />
    </div>
  );
}
