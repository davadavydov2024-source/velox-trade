"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Plus, Trash2, Edit3 } from "lucide-react";
import { getProducts, createProduct, updateProduct, deleteProduct } from "@/lib/products";
import { getFeatureFlags } from "@/lib/featureFlags";
import { Product, Rarity, RARITY_LABEL, DeliveryMethod } from "@/types";
import { useToast } from "@/lib/toastContext";
import { safeImageSrc, isValidImageSrc } from "@/lib/safeImage";
import { ImageUploadField } from "@/components/ImageUploadField";
import { auth } from "@/lib/firebase";
import { logPriceChange } from "@/lib/priceHistory";

const EMPTY: Omit<Product, "id" | "createdAt"> = {
  gameId: "",
  sellerId: "store",
  name: "",
  description: "",
  image: "",
  price: 0,
  rarity: "common",
  stock: 0,
  deliveryMethod: "seller",
};

export default function AdminProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [showForm, setShowForm] = useState(false);
  const [minPrice, setMinPrice] = useState(1);
  const { toast } = useToast();

  useEffect(() => {
    refresh();
    getFeatureFlags().then((f) => setMinPrice(f.minProductPriceRub || 1));
  }, []);

  async function refresh() {
    setLoading(true);
    try {
      setProducts(await getProducts());
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setEditing(null);
    setForm(EMPTY);
    setShowForm(true);
  }

  function openEdit(p: Product) {
    setEditing(p);
    setForm({ ...p });
    setShowForm(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (form.image && !isValidImageSrc(form.image)) {
      toast("warning", "Ссылка на изображение должна начинаться с http:// или https://");
      return;
    }
    if (!form.price || form.price < minPrice) {
      toast("warning", `Укажи цену товара не меньше ${minPrice} ₽ — сейчас поле пустое или меньше минимума`);
      return;
    }
    try {
      if (editing) {
        await updateProduct(editing.id, form);
        toast("success", "Товар обновлён");
        if (form.price !== editing.price) {
          logPriceChange(editing.id, form.price).catch(() => {});
        }
        // Уведомляем тех, у кого товар в избранном, если цена упала или он снова в наличии —
        // не блокируем сохранение, если это не сработает.
        auth.currentUser
          ?.getIdToken()
          .then((idToken) =>
            fetch("/api/products/notify-price-change", {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
              body: JSON.stringify({
                productId: editing.id,
                productName: form.name,
                oldPrice: editing.price,
                newPrice: form.price,
                oldStock: editing.stock,
                newStock: form.stock,
              }),
            })
          )
          .catch(() => {});
      } else {
        const ref = await createProduct(form);
        logPriceChange(ref.id, form.price).catch(() => {});
        toast("success", "Товар создан");
      }
      setShowForm(false);
      refresh();
    } catch (err: any) {
      if (err?.code === "permission-denied") {
        toast("error", "Нет прав на запись. Проверь, что твой UID указан в firestore.rules как админ.");
      } else {
        toast("error", "Ошибка сохранения товара");
      }
      console.error(err);
    }
  }

  async function handleDelete(p: Product) {
    if (!confirm(`Удалить «${p.name}»?`)) return;
    await deleteProduct(p.id);
    setProducts((list) => list.filter((x) => x.id !== p.id));
    toast("success", "Товар удалён");
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Товары</h1>
        <button onClick={openCreate} className="btn-primary px-4 py-2.5 text-sm flex items-center gap-2">
          <Plus size={16} /> Добавить товар
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSave} className="card p-5 grid sm:grid-cols-2 gap-4">
          <input
            autoComplete="off"
            required
            placeholder="Название"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="input-field py-2.5"
          />
          <input
            autoComplete="off"
            required
            placeholder="ID игры (slug, напр. adopt-me)"
            value={form.gameId}
            onChange={(e) => setForm({ ...form, gameId: e.target.value })}
            className="input-field py-2.5"
          />
          <input
            autoComplete="off"
            required
            placeholder='UID продавца (оставь "store" для товаров магазина)'
            value={form.sellerId}
            onChange={(e) => setForm({ ...form, sellerId: e.target.value })}
            className="input-field py-2.5"
          />
          <div className="sm:col-span-2">
            <ImageUploadField value={form.image} onChange={(url) => setForm({ ...form, image: url })} folder="products" label="Изображение товара" />
          </div>
          <textarea
            placeholder="Описание"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="input-field py-2.5 sm:col-span-2"
            rows={2}
          />
          <input
            autoComplete="off"
            required
            type="number"
            min={minPrice}
            placeholder="Цена"
            value={form.price || ""}
            onChange={(e) => setForm({ ...form, price: Number(e.target.value) })}
            className="input-field py-2.5"
          />
          <input
            autoComplete="off"
            required
            type="number"
            placeholder="Остаток"
            value={form.stock}
            onChange={(e) => setForm({ ...form, stock: Number(e.target.value) })}
            className="input-field py-2.5"
          />
          <select
            value={form.rarity}
            onChange={(e) => setForm({ ...form, rarity: e.target.value as Rarity })}
            className="input-field py-2.5"
          >
            {(Object.keys(RARITY_LABEL) as Rarity[]).map((r) => (
              <option key={r} value={r}>
                {RARITY_LABEL[r]}
              </option>
            ))}
          </select>
          <select
            value={form.deliveryMethod}
            onChange={(e) => setForm({ ...form, deliveryMethod: e.target.value as DeliveryMethod })}
            className="input-field py-2.5"
          >
            <option value="seller">Выдача: сам продавец</option>
            <option value="bot">Выдача: через бота-посредника</option>
          </select>
          <label className="flex items-center gap-2 text-sm text-white/70">
            <input
            autoComplete="off"
              type="checkbox"
              checked={!!form.isNew}
              onChange={(e) => setForm({ ...form, isNew: e.target.checked })}
            />
            Новинка
          </label>
          <div className="sm:col-span-2 flex gap-3">
            <button className="btn-primary px-5 py-2.5 text-sm">{editing ? "Сохранить" : "Создать"}</button>
            <button type="button" onClick={() => setShowForm(false)} className="btn-secondary px-5 py-2.5 text-sm">
              Отмена
            </button>
          </div>
        </form>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-white/40 border-b border-border">
              <th className="p-3">Товар</th>
              <th className="p-3">Игра</th>
              <th className="p-3">Цена</th>
              <th className="p-3">Остаток</th>
              <th className="p-3">Редкость</th>
              <th className="p-3">Действия</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="p-6 text-center text-white/40">
                  Загрузка...
                </td>
              </tr>
            ) : (
              products.map((p) => (
                <tr key={p.id} className="border-b border-border/50 hover:bg-white/[0.02]">
                  <td className="p-3 flex items-center gap-3">
                    <div className="relative w-9 h-9 rounded-lg bg-black/30 shrink-0">
                      {isValidImageSrc(p.image) && <Image src={safeImageSrc(p.image)} alt={p.name} fill className="object-contain p-1 rounded-lg" sizes="36px" />}
                    </div>
                    {p.name}
                  </td>
                  <td className="p-3 text-white/50">{p.gameId}</td>
                  <td className="p-3">{p.price} ₽</td>
                  <td className="p-3">{p.stock}</td>
                  <td className="p-3 text-white/50">{RARITY_LABEL[p.rarity]}</td>
                  <td className="p-3">
                    <div className="flex gap-2">
                      <button onClick={() => openEdit(p)} className="p-1.5 rounded-md hover:bg-white/10 text-white/60">
                        <Edit3 size={15} />
                      </button>
                      <button onClick={() => handleDelete(p)} className="p-1.5 rounded-md hover:bg-white/10 text-red-400">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
