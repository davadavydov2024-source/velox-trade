"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, Wallet, Package, Ban } from "lucide-react";
import { getAllWheelPrizes, createWheelPrize, updateWheelPrize, deleteWheelPrize } from "@/lib/wheelPrizes";
import { getProducts } from "@/lib/products";
import { safeImageSrc } from "@/lib/safeImage";
import { WheelPrize, WheelPrizeType, Product } from "@/types";
import { useToast } from "@/lib/toastContext";

type FormState = {
  type: WheelPrizeType;
  productId: string;
  balanceRub: number;
  name: string;
  weight: number;
  remaining: number;
};

const EMPTY_FORM: FormState = { type: "balance", productId: "", balanceRub: 50, name: "Пусто", weight: 10, remaining: 999999 };

export default function AdminWheelPage() {
  const { toast } = useToast();
  const [prizes, setPrizes] = useState<WheelPrize[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  useEffect(() => {
    refresh();
    getProducts().then(setProducts).catch(() => setProducts([]));
  }, []);

  async function refresh() {
    setLoading(true);
    setPrizes(await getAllWheelPrizes());
    setLoading(false);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (form.weight <= 0) {
      toast("warning", "Вес (шанс) должен быть больше 0");
      return;
    }
    try {
      if (form.type === "product") {
        const product = products.find((p) => p.id === form.productId);
        if (!product) {
          toast("warning", "Выбери товар из каталога");
          return;
        }
        await createWheelPrize({
          type: "product",
          name: product.name,
          image: product.image,
          productId: product.id,
          weight: form.weight,
          remaining: form.remaining || product.stock || 1,
        });
      } else if (form.type === "balance") {
        await createWheelPrize({
          type: "balance",
          name: `+${form.balanceRub} ₽ на баланс`,
          balanceRub: form.balanceRub,
          weight: form.weight,
          remaining: form.remaining,
        });
      } else {
        await createWheelPrize({
          type: "nothing",
          name: form.name || "Пусто",
          weight: form.weight,
          remaining: form.remaining,
        });
      }
      toast("success", "Приз добавлен в колесо");
      setForm(EMPTY_FORM);
      setShowForm(false);
      await refresh();
    } catch {
      toast("error", "Не удалось добавить приз");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Убрать этот приз из колеса?")) return;
    await deleteWheelPrize(id);
    await refresh();
  }

  async function handleWeightChange(prize: WheelPrize, weight: number) {
    await updateWheelPrize(prize.id, { weight });
    await refresh();
  }

  const totalWeight = prizes.filter((p) => p.remaining > 0).reduce((s, p) => s + p.weight, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold mb-1">🎡 Колесо Фортуны</h1>
          <p className="text-sm text-white/40">
            Настрой призы и их шансы (вес — чем больше число, тем чаще выпадает относительно других). Приз с товаром из
            каталога после выигрыша уменьшает остаток на складе и пропадает из колеса, когда заканчивается.
            Промокод для запуска колеса создаётся на странице «Промокоды» (тип 🎡 Колесо).
          </p>
        </div>
        <button onClick={() => setShowForm((v) => !v)} className="btn-primary px-4 py-2.5 flex items-center gap-2">
          <Plus size={16} /> Добавить приз
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="card p-5 space-y-3">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setForm({ ...EMPTY_FORM, type: "balance" })}
              className={`flex-1 py-2.5 rounded-btn text-sm flex items-center justify-center gap-2 ${form.type === "balance" ? "bg-accent text-black" : "bg-surface text-white/50"}`}
            >
              <Wallet size={14} /> Баланс
            </button>
            <button
              type="button"
              onClick={() => setForm({ ...EMPTY_FORM, type: "product", remaining: 1 })}
              className={`flex-1 py-2.5 rounded-btn text-sm flex items-center justify-center gap-2 ${form.type === "product" ? "bg-accent text-black" : "bg-surface text-white/50"}`}
            >
              <Package size={14} /> Товар
            </button>
            <button
              type="button"
              onClick={() => setForm({ ...EMPTY_FORM, type: "nothing" })}
              className={`flex-1 py-2.5 rounded-btn text-sm flex items-center justify-center gap-2 ${form.type === "nothing" ? "bg-accent text-black" : "bg-surface text-white/50"}`}
            >
              <Ban size={14} /> Пусто
            </button>
          </div>

          {form.type === "balance" && (
            <input
            autoComplete="off"
              type="number"
              min={1}
              value={form.balanceRub}
              onChange={(e) => setForm({ ...form, balanceRub: Number(e.target.value) })}
              placeholder="Сумма на баланс, ₽"
              className="input-field py-2.5 text-sm w-full"
            />
          )}

          {form.type === "product" && (
            <select
              required
              value={form.productId}
              onChange={(e) => setForm({ ...form, productId: e.target.value })}
              className="input-field py-2.5 text-sm w-full"
            >
              <option value="">Выбери товар из каталога...</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {p.price} ₽ (остаток {p.stock})
                </option>
              ))}
            </select>
          )}

          {form.type === "nothing" && (
            <input
            autoComplete="off"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Текст приза (например «Пусто» или «Повезёт в следующий раз»)"
              className="input-field py-2.5 text-sm w-full"
            />
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-white/40 mb-1">Вес (шанс)</p>
              <input
            autoComplete="off"
                type="number"
                min={1}
                value={form.weight}
                onChange={(e) => setForm({ ...form, weight: Number(e.target.value) })}
                className="input-field py-2.5 text-sm w-full"
              />
            </div>
            <div>
              <p className="text-xs text-white/40 mb-1">
                {form.type === "product" ? "Сколько раз можно выиграть (по умолч. = остаток на складе)" : "Сколько раз можно выиграть"}
              </p>
              <input
            autoComplete="off"
                type="number"
                min={0}
                value={form.remaining}
                onChange={(e) => setForm({ ...form, remaining: Number(e.target.value) })}
                className="input-field py-2.5 text-sm w-full"
              />
            </div>
          </div>

          <div className="flex gap-2">
            <button className="btn-primary px-5 py-2.5 text-sm">Добавить</button>
            <button type="button" onClick={() => setShowForm(false)} className="btn-secondary px-5 py-2.5 text-sm">
              Отмена
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="card p-10 text-center text-white/40">Загрузка...</div>
      ) : prizes.length === 0 ? (
        <div className="card p-10 text-center text-white/40">Призов пока нет — добавь хотя бы один выше.</div>
      ) : (
        <div className="space-y-2">
          {prizes.map((p) => {
            const depleted = p.remaining <= 0;
            const chance = totalWeight > 0 && !depleted ? ((p.weight / totalWeight) * 100).toFixed(1) : "0";
            return (
              <div key={p.id} className={`card p-4 flex items-center justify-between gap-4 ${depleted ? "opacity-40" : ""}`}>
                <div className="flex items-center gap-3">
                  {p.type === "product" && p.image ? (
                    <img src={safeImageSrc(p.image)} alt={p.name} className="w-10 h-10 rounded-btn object-cover shrink-0" />
                  ) : (
                    <span className="w-10 h-10 rounded-btn bg-black/30 flex items-center justify-center text-lg shrink-0">
                      {p.type === "balance" ? "💰" : "🚫"}
                    </span>
                  )}
                  <div>
                    <p className="font-medium text-sm">{p.name}</p>
                    <p className="text-xs text-white/40">
                      Остаток: {depleted ? "закончился, убран из колеса" : p.remaining} · Шанс: ~{chance}%
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <input
            autoComplete="off"
                    type="number"
                    min={1}
                    defaultValue={p.weight}
                    onBlur={(e) => handleWeightChange(p, Number(e.target.value))}
                    className="input-field py-1.5 text-sm w-20"
                    title="Вес (шанс)"
                  />
                  <button onClick={() => handleDelete(p.id)} className="p-2 rounded-btn hover:bg-white/5 text-red-400">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
