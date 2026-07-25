"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Rocket, Zap, Star } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { useToast } from "@/lib/toastContext";
import { getProducts, boostProduct } from "@/lib/products";
import { getFeatureFlags } from "@/lib/featureFlags";
import { Product, DEFAULT_FEATURE_FLAGS, FeatureFlags } from "@/types";
import { safeImageSrc } from "@/lib/safeImage";
import { useLanguage } from "@/lib/languageStore";
import { tf, rarityLabel } from "@/lib/i18n";

const LOCALE: Record<string, string> = { ru: "ru-RU", en: "en-US", zh: "zh-CN" };

function ProductBoostCard({
  product,
  flags,
  onBoosted,
}: {
  product: Product;
  flags: FeatureFlags;
  onBoosted: (id: string, tier: "game" | "home", boostUntil: number) => void;
}) {
  const { t, language } = useLanguage();
  const { toast } = useToast();
  const { profile, refreshProfile } = useAuth();
  const [buying, setBuying] = useState<"game" | "home" | null>(null);

  const now = Date.now();
  const isActive = (product.boostUntil ?? 0) > now;
  const locale = LOCALE[language] ?? "ru-RU";

  async function handleBuy(tier: "game" | "home") {
    const price = tier === "game" ? flags.boostGamePriceRub : flags.boostHomePriceRub;
    if ((profile?.balance ?? 0) < price) {
      toast("error", t("my_products_toast_insufficient"));
      return;
    }
    setBuying(tier);
    try {
      const result = await boostProduct(product.id, tier);
      onBoosted(product.id, result.boostTier as "game" | "home", result.boostUntil);
      await refreshProfile();
      toast("success", t("my_products_toast_success"));
    } catch (err: any) {
      toast("error", err?.message || t("my_products_toast_failed"));
    } finally {
      setBuying(null);
    }
  }

  return (
    <div className="card p-4">
      <div className="flex gap-4">
        <div className="relative w-16 h-16 rounded-btn overflow-hidden bg-black/30 shrink-0">
          <Image src={safeImageSrc(product.image)} alt={product.name} fill className="object-cover" sizes="64px" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-medium truncate">{product.name}</p>
          <p className="text-xs text-white/40">
            {rarityLabel(language, product.rarity)} · {product.price} ₽ · {tf(language, "my_products_stock", { n: product.stock })}
          </p>
          {isActive && (
            <p className="text-xs text-accent mt-1 flex items-center gap-1">
              {product.boostTier === "home" ? <Star size={12} /> : <Rocket size={12} />}
              {tf(language, product.boostTier === "home" ? "my_products_boost_active_home" : "my_products_boost_active_game", {
                date: new Date(product.boostUntil!).toLocaleDateString(locale),
              })}
            </p>
          )}
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-2 mt-3">
        <div className="rounded-btn border border-border p-3">
          <p className="text-sm font-medium flex items-center gap-1.5">
            <Rocket size={14} className="text-accent" /> {t("my_products_boost_game_title")}
          </p>
          <p className="text-xs text-white/40 my-1.5">{tf(language, "my_products_boost_game_desc", { days: flags.boostGameDays })}</p>
          <button
            onClick={() => handleBuy("game")}
            disabled={buying !== null}
            className="btn-secondary w-full py-2 text-xs disabled:opacity-50"
          >
            {buying === "game"
              ? t("my_products_boost_confirming")
              : tf(language, isActive ? "my_products_boost_extend" : "my_products_boost_buy", { price: flags.boostGamePriceRub })}
          </button>
        </div>
        <div className="rounded-btn border border-border p-3">
          <p className="text-sm font-medium flex items-center gap-1.5">
            <Star size={14} className="text-accent" /> {t("my_products_boost_home_title")}
          </p>
          <p className="text-xs text-white/40 my-1.5">{tf(language, "my_products_boost_home_desc", { days: flags.boostHomeDays })}</p>
          <button
            onClick={() => handleBuy("home")}
            disabled={buying !== null}
            className="btn-primary w-full py-2 text-xs disabled:opacity-50"
          >
            {buying === "home"
              ? t("my_products_boost_confirming")
              : tf(language, isActive && product.boostTier === "home" ? "my_products_boost_extend" : "my_products_boost_buy", {
                  price: flags.boostHomePriceRub,
                })}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function MyProductsPage() {
  const { t, language } = useLanguage();
  const { user, profile } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [flags, setFlags] = useState<FeatureFlags>(DEFAULT_FEATURE_FLAGS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    Promise.all([getProducts({ sellerId: user.uid }), getFeatureFlags()])
      .then(([p, f]) => {
        setProducts(p);
        setFlags(f);
      })
      .finally(() => setLoading(false));
  }, [user]);

  function handleBoosted(id: string, tier: "game" | "home", boostUntil: number) {
    setProducts((list) => list.map((p) => (p.id === id ? { ...p, boostTier: tier, boostUntil } : p)));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Rocket size={20} className="text-accent" /> {t("my_products_title")}
        </h1>
        {profile && <p className="text-xs text-white/30">{tf(language, "my_products_balance_label", { balance: profile.balance.toFixed(2) })}</p>}
      </div>
      <p className="text-sm text-white/40">{t("my_products_intro")}</p>

      {loading ? (
        <div className="card p-10 text-center text-white/40">{t("common_loading")}</div>
      ) : products.length === 0 ? (
        <div className="card p-10 text-center text-white/40">{t("my_products_empty")}</div>
      ) : (
        <div className="space-y-3">
          {products.map((p) => (
            <ProductBoostCard key={p.id} product={p} flags={flags} onBoosted={handleBoosted} />
          ))}
        </div>
      )}
    </div>
  );
}
