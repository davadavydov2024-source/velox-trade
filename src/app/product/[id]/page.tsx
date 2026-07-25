"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Minus, Plus, ShoppingCart, Zap } from "lucide-react";
import { getProductById, getProducts } from "@/lib/products";
import { Product } from "@/types";
import { useLanguage } from "@/lib/languageStore";
import { rarityLabel, tf } from "@/lib/i18n";
import { useCart } from "@/lib/cartStore";
import { useToast } from "@/lib/toastContext";
import { ProductCard } from "@/components/ProductCard";
import { safeImageSrc } from "@/lib/safeImage";

export default function ProductPage() {
  const { t, language } = useLanguage();
  const { id } = useParams<{ id: string }>();
  const [product, setProduct] = useState<Product | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [qty, setQty] = useState(1);
  const [related, setRelated] = useState<Product[]>([]);
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
  }, [product]);

  if (notFound) {
    return <div className="max-w-7xl mx-auto px-4 py-20 text-center text-white/40">{t("product_not_found")}</div>;
  }
  if (!product) {
    return <div className="max-w-7xl mx-auto px-4 py-20 text-center text-white/40">{t("common_loading")}</div>;
  }

  const finalPrice = product.discountPercent
    ? +(product.price * (1 - product.discountPercent / 100)).toFixed(2)
    : product.price;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
      <div className="grid md:grid-cols-2 gap-10">
        <div className="card p-8 aspect-square relative">
          <Image src={safeImageSrc(product.image)} alt={product.name} fill className="object-contain p-10" sizes="500px" />
        </div>

        <div>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-md bg-accent/15 text-accent">
            {rarityLabel(language, product.rarity)}
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
              aria-label={t("product_decrease_qty")}
            >
              <Minus size={16} />
            </button>
            <span className="w-12 text-center font-medium">{qty}</span>
            <button
              className="btn-secondary p-2.5"
              onClick={() => setQty((q) => Math.min(product.stock, q + 1))}
              aria-label={t("product_increase_qty")}
            >
              <Plus size={16} />
            </button>
            <span className="text-sm text-white/40 ml-2">{tf(language, "product_stock_label", { n: product.stock })}</span>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/cart"
              onClick={() => add(product, qty)}
              className="btn-primary px-6 py-3 flex items-center gap-2"
            >
              <Zap size={18} /> {t("product_buy_now")}
            </Link>
            <button
              onClick={() => {
                add(product, qty);
                toast("success", tf(language, "product_added_to_cart", { name: product.name, qty }));
              }}
              className="btn-secondary px-6 py-3 flex items-center gap-2"
              disabled={product.stock <= 0}
            >
              <ShoppingCart size={18} /> {t("product_add_to_cart")}
            </button>
          </div>
        </div>
      </div>

      {related.length > 0 && (
        <section className="mt-16">
          <h2 className="text-xl font-bold mb-4">{t("product_related")}</h2>
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
