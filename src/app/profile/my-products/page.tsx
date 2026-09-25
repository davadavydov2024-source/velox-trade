"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Rocket, Star, Pencil, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { useToast } from "@/lib/toastContext";
import { getProducts, boostProduct, deleteProduct } from "@/lib/products";
import { getFeatureFlags } from "@/lib/featureFlags";
import { createProductEditRequest, MAX_PRODUCT_EDITS } from "@/lib/productEditRequests";
import { Product, DEFAULT_FEATURE_FLAGS, FeatureFlags, Rarity, RARITY_LABEL } from "@/types";
import { safeImageSrc } from "@/lib/safeImage";
import { useLanguage } from "@/lib/languageStore";
import { tf, rarityLabel } from "@/lib/i18n";

const RARITIES: Rarity[] = ["common", "uncommon", "rare", "epic", "legendary"];
const LOCALE: Record<string, string> = { ru: "ru-RU", en: "en-US", zh: "zh-CN" };

function ProductBoostCard({
  product,
  flags,
  onBoosted,
  onDeleted,
}: {
  product: Product;
  flags: FeatureFlags;
  onBoosted: (id: string, tier: "game" | "home", boostUntil: number) => void;
  onDeleted: (id: string) => void;
}) {
  const { t, language } = useLanguage();
  const { toast } = useToast();
  const { profile, refreshProfile } = useAuth();
  const [buying, setBuying] = useState<"game" | "home" | null>(null);
  const [editing, setEditing] = useState(false);
  const [submittingEdit, setSubmittingEdit] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Название и фото сюда сознательно не входят — их теперь редактировать нельзя вообще (см.
  // комментарий у формы ниже). Оплата Stars раньше менялась отдельным блоком мгновенно и без
  // ограничений — теперь это часть той же заявки на редактирование с лимитом 3 раза на товар.
  const [editForm, setEditForm] = useState({
    description: product.description,
    price: product.price,
    category: product.category ?? "",
    rarity: product.rarity,
    starsPrice: product.starsPrice ? String(product.starsPrice) : "",
  });

  const editCount = product.editCount ?? 0;
  const editsLeft = MAX_PRODUCT_EDITS - editCount;

  async function handleSubmitEdit() {
    if (!editForm.description.trim() || editForm.price <= 0) {
      toast("warning", "Заполни все поля корректно");
      return;
    }
    const starsTrimmed = editForm.starsPrice.trim();
    const starsValue = starsTrimmed === "" ? null : Number(starsTrimmed);
    if (starsValue !== null && (!Number.isInteger(starsValue) || starsValue < 15)) {
      toast("warning", "Цена в Stars — целое число, минимум 15 (или оставь поле пустым, чтобы отключить)");
      return;
    }
    setSubmittingEdit(true);
    try {
      await createProductEditRequest({
        productId: product.id,
        sellerId: product.sellerId,
        productName: product.name,
        // Название и фото не меняются — просто передаём текущие значения товара как есть.
        proposedName: product.name,
        proposedImage: product.image,
        proposedDescription: editForm.description,
        proposedPrice: editForm.price,
        proposedCategory: editForm.category,
        proposedRarity: editForm.rarity,
        proposedStarsPrice: starsValue,
      });
      toast("success", "Заявка на редактирование отправлена админу");
      setEditing(false);
    } catch {
      toast("error", "Не удалось отправить заявку");
    } finally {
      setSubmittingEdit(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Удалить товар «${product.name}» безвозвратно?`)) return;
    setDeleting(true);
    try {
      await deleteProduct(product.id);
      toast("success", "Товар удалён");
      onDeleted(product.id);
    } catch {
      toast("error", "Не удалось удалить товар");
      setDeleting(false);
    }
  }

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
            {rarityLabel(language, product.rarity)} · {product.price} ₽
            {product.starsPrice ? ` · ${product.starsPrice} ⭐` : ""} · {tf(language, "my_products_stock", { n: product.stock })}
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

      {editing ? (
        <div className="mt-3 rounded-btn border border-border p-3 space-y-2.5">
          {/* Название и фото сюда намеренно не включены — их менять нельзя. Редактируются:
              описание, цена, категория, редкость и оплата Stars — всё одной заявкой, до 3 раз
              на товар (см. MAX_PRODUCT_EDITS), с проверкой администратором. */}
          <p className="text-xs text-white/30">Название и фото товара изменить нельзя — только описание, цену, категорию, редкость и оплату Stars.</p>
          <textarea
            value={editForm.description}
            onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="Описание"
            className="input-field py-2 text-sm w-full min-h-[70px]"
          />
          <input
            autoComplete="off"
            type="number"
            min={1}
            value={editForm.price || ""}
            onChange={(e) => setEditForm((f) => ({ ...f, price: Number(e.target.value) }))}
            placeholder="Цена, ₽"
            className="input-field py-2 text-sm w-full"
          />
          <input
            autoComplete="off"
            value={editForm.category}
            onChange={(e) => setEditForm((f) => ({ ...f, category: e.target.value }))}
            placeholder="Категория (необязательно)"
            className="input-field py-2 text-sm w-full"
          />
          <select
            value={editForm.rarity}
            onChange={(e) => setEditForm((f) => ({ ...f, rarity: e.target.value as Rarity }))}
            className="input-field py-2 text-sm w-full"
          >
            {RARITIES.map((r) => (
              <option key={r} value={r}>
                {RARITY_LABEL[r]}
              </option>
            ))}
          </select>
          <div>
            <p className="text-xs text-white/40 mb-1">Оплата Telegram Stars ⭐ (целое число, минимум 15 — оставь пустым, чтобы отключить)</p>
            <input
              autoComplete="off"
              type="number"
              min={15}
              step={1}
              value={editForm.starsPrice}
              onChange={(e) => setEditForm((f) => ({ ...f, starsPrice: e.target.value }))}
              placeholder="Например, 50"
              className="input-field py-2 text-sm w-full"
            />
          </div>
          <div className="flex gap-2">
            <button onClick={handleSubmitEdit} disabled={submittingEdit} className="btn-primary flex-1 py-2 text-xs disabled:opacity-50">
              {submittingEdit ? "Отправка..." : "Отправить на проверку админу"}
            </button>
            <button onClick={() => setEditing(false)} className="btn-secondary px-3 py-2 text-xs">
              Отмена
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
          <button
            onClick={() => setEditing(true)}
            disabled={editsLeft <= 0}
            className="text-xs text-white/40 hover:text-accent flex items-center gap-1.5 disabled:opacity-40 disabled:hover:text-white/40"
          >
            <Pencil size={13} /> {editsLeft > 0 ? `Редактировать (осталось ${editsLeft} из ${MAX_PRODUCT_EDITS})` : "Лимит правок исчерпан (3/3)"}
          </button>
          <button onClick={handleDelete} disabled={deleting} className="text-xs text-red-400/70 hover:text-red-400 flex items-center gap-1.5 disabled:opacity-50">
            <Trash2 size={13} /> {deleting ? "Удаление..." : "Удалить товар"}
          </button>
        </div>
      )}
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

  function handleDeleted(id: string) {
    setProducts((list) => list.filter((p) => p.id !== id));
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
            <ProductBoostCard key={p.id} product={p} flags={flags} onBoosted={handleBoosted} onDeleted={handleDeleted} />
          ))}
        </div>
      )}
    </div>
  );
}
