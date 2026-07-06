"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Plus, Trash2, Edit3 } from "lucide-react";
import { getProducts, createProduct, updateProduct, deleteProduct } from "@/lib/products";
import { Product, Rarity, RARITY_LABEL } from "@/types";
import { useToast } from "@/lib/toastContext";
import { safeImageSrc, isValidImageSrc } from "@/lib/safeImage";
import { ImageUploadField } from "@/components/ImageUploadField";

const EMPTY: Omit<Product, "id" | "createdAt"> = {
  gameId: "",
  sellerId: "store",
  name: "",
  description: "",
  image: "",
  price: 0,
  rarity: "common",
  stock: 0,
};

export default function AdminProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [showForm, setShowForm] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    refresh();
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
    try {
      if (editing) {
        await updateProduct(editing.id, form);
        toast("success", "Товар обновлён");
      } else {
        await createProduct(form);
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
            required
            placeholder="Название"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="input-field py-2.5"
          />
          <input
            required
            placeholder="ID игры (slug, напр. adopt-me)"
            value={form.gameId}
            onChange={(e) => setForm({ ...form, gameId: e.target.value })}
            className="input-field py-2.5"
          />
          <input
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
            required
            type="number"
            placeholder="Цена"
            value={form.price}
            onChange={(e) => setForm({ ...form, price: Number(e.target.value) })}
            className="input-field py-2.5"
          />
          <input
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
          <label className="flex items-center gap-2 text-sm text-white/70">
            <input
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
