"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, Power, Percent, Gift as GiftIcon, Wallet, Package } from "lucide-react";
import { getAllPromoCodes, createPromoCode, updatePromoCode, deletePromoCode } from "@/lib/promoCodes";
import { getProducts } from "@/lib/products";
import { PromoCode, Product } from "@/types";
import { useToast } from "@/lib/toastContext";

type FormState = {
  code: string;
  type: "discount" | "gift";
  discountPercent: number;
  giftType: "balance" | "product";
  giftBalance: number;
  giftProductId: string;
  maxUses: string; // пусто = без ограничения
  expiresAt: string; // yyyy-mm-dd, пусто = бессрочно
  active: boolean;
};

const EMPTY_FORM: FormState = {
  code: "",
  type: "discount",
  discountPercent: 10,
  giftType: "balance",
  giftBalance: 100,
  giftProductId: "",
  maxUses: "",
  expiresAt: "",
  active: true,
};

export default function AdminPromoCodesPage() {
  const { toast } = useToast();
  const [codes, setCodes] = useState<PromoCode[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    refresh();
    getProducts().then(setProducts).catch(() => setProducts([]));
  }, []);

  async function refresh() {
    setLoading(true);
    try {
      setCodes(await getAllPromoCodes());
    } catch (err: any) {
      if (err?.code === "permission-denied") {
        toast("error", "Нет прав на чтение. Проверь, что твой UID указан в firestore.rules как админ.");
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.code.trim()) {
      toast("warning", "Введите код промокода");
      return;
    }
    setSaving(true);
    try {
      const maxUses = form.maxUses.trim() === "" ? null : Number(form.maxUses);
      const expiresAt = form.expiresAt ? new Date(form.expiresAt).getTime() : null;

      if (form.type === "discount") {
        await createPromoCode({
          code: form.code,
          type: "discount",
          discountPercent: form.discountPercent,
          maxUses,
          active: form.active,
          expiresAt,
        });
      } else {
        const product = products.find((p) => p.id === form.giftProductId);
        await createPromoCode({
          code: form.code,
          type: "gift",
          giftType: form.giftType,
          giftBalance: form.giftType === "balance" ? form.giftBalance : undefined,
          giftProductId: form.giftType === "product" ? form.giftProductId : undefined,
          giftProductName: form.giftType === "product" ? product?.name : undefined,
          giftProductImage: form.giftType === "product" ? product?.image : undefined,
          maxUses,
          active: form.active,
          expiresAt,
        });
      }
      toast("success", "Промокод создан");
      setForm(EMPTY_FORM);
      setShowForm(false);
      refresh();
    } catch (err: any) {
      if (err?.code === "permission-denied") {
        toast("error", "Нет прав на запись. Проверь, что твой UID указан в firestore.rules как админ.");
      } else {
        toast("error", "Не удалось создать промокод");
      }
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(code: PromoCode) {
    await updatePromoCode(code.id, { active: !code.active });
    setCodes((list) => list.map((c) => (c.id === code.id ? { ...c, active: !c.active } : c)));
  }

  async function handleDelete(code: PromoCode) {
    if (!confirm(`Удалить промокод «${code.code}»?`)) return;
    await deletePromoCode(code.id);
    setCodes((list) => list.filter((c) => c.id !== code.id));
    toast("success", "Промокод удалён");
  }

  function describe(code: PromoCode): string {
    if (code.type === "discount") return `Скидка ${code.discountPercent ?? 0}% в корзине`;
    if (code.giftType === "balance") return `Подарок: +${code.giftBalance ?? 0} ₽ на баланс`;
    if (code.giftType === "product") return `Подарок: предмет «${code.giftProductName ?? "?"}»`;
    return "—";
  }

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Промокоды</h1>
      <p className="text-sm text-white/40 max-w-2xl">
        Два типа: <b>скидка</b> — применяется в корзине при оформлении заказа; <b>промо-подарок</b> — активируется
        пользователем в личном кабинете (раздел «Промо-подарки») и сразу начисляет баланс или выдаёт бесплатный
        предмет из каталога.
      </p>

      <button onClick={() => setShowForm((v) => !v)} className="btn-primary px-4 py-2.5 text-sm flex items-center gap-2">
        <Plus size={16} /> Новый промокод
      </button>

      {showForm && (
        <form onSubmit={handleCreate} className="card p-5 space-y-4 max-w-xl">
          <input
            required
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
            placeholder="КОД (например VELOX10)"
            className="input-field py-2.5 text-sm uppercase"
          />

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setForm({ ...form, type: "discount" })}
              className={`flex-1 py-2.5 rounded-btn text-sm flex items-center justify-center gap-2 ${form.type === "discount" ? "bg-accent text-black" : "bg-surface text-white/50"}`}
            >
              <Percent size={14} /> Скидка
            </button>
            <button
              type="button"
              onClick={() => setForm({ ...form, type: "gift" })}
              className={`flex-1 py-2.5 rounded-btn text-sm flex items-center justify-center gap-2 ${form.type === "gift" ? "bg-accent text-black" : "bg-surface text-white/50"}`}
            >
              <GiftIcon size={14} /> Промо-подарок
            </button>
          </div>

          {form.type === "discount" ? (
            <input
              type="number"
              min={1}
              max={100}
              value={form.discountPercent}
              onChange={(e) => setForm({ ...form, discountPercent: Number(e.target.value) })}
              placeholder="Процент скидки"
              className="input-field py-2.5 text-sm"
            />
          ) : (
            <div className="space-y-3">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setForm({ ...form, giftType: "balance" })}
                  className={`flex-1 py-2 rounded-btn text-xs flex items-center justify-center gap-1.5 ${form.giftType === "balance" ? "bg-accent/20 text-accent" : "bg-surface text-white/50"}`}
                >
                  <Wallet size={13} /> На баланс
                </button>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, giftType: "product" })}
                  className={`flex-1 py-2 rounded-btn text-xs flex items-center justify-center gap-1.5 ${form.giftType === "product" ? "bg-accent/20 text-accent" : "bg-surface text-white/50"}`}
                >
                  <Package size={13} /> Предмет
                </button>
              </div>
              {form.giftType === "balance" ? (
                <input
                  type="number"
                  min={1}
                  value={form.giftBalance}
                  onChange={(e) => setForm({ ...form, giftBalance: Number(e.target.value) })}
                  placeholder="Сумма на баланс, ₽"
                  className="input-field py-2.5 text-sm"
                />
              ) : (
                <select
                  required
                  value={form.giftProductId}
                  onChange={(e) => setForm({ ...form, giftProductId: e.target.value })}
                  className="input-field py-2.5 text-sm"
                >
                  <option value="">Выбери предмет из каталога...</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — {p.price} ₽
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <input
              type="number"
              min={1}
              value={form.maxUses}
              onChange={(e) => setForm({ ...form, maxUses: e.target.value })}
              placeholder="Лимит активаций (пусто = без лимита)"
              className="input-field py-2.5 text-sm"
            />
            <input
              type="date"
              value={form.expiresAt}
              onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
              className="input-field py-2.5 text-sm"
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-white/70">
            <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
            Активен сразу после создания
          </label>

          <div className="flex gap-3">
            <button disabled={saving} className="btn-primary px-5 py-2.5 text-sm disabled:opacity-50">
              {saving ? "Создаём..." : "Создать"}
            </button>
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
              <th className="p-3">Код</th>
              <th className="p-3">Тип / что даёт</th>
              <th className="p-3">Использован</th>
              <th className="p-3">Истекает</th>
              <th className="p-3">Статус</th>
              <th className="p-3">Действия</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="p-6 text-center text-white/40">Загрузка...</td>
              </tr>
            ) : codes.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-6 text-center text-white/40">Промокодов пока нет</td>
              </tr>
            ) : (
              codes.map((c) => (
                <tr key={c.id} className="border-b border-border/50 hover:bg-white/[0.02]">
                  <td className="p-3 font-mono font-semibold">{c.code}</td>
                  <td className="p-3 text-white/60">{describe(c)}</td>
                  <td className="p-3 text-white/50">{c.usedBy.length}{c.maxUses != null ? ` / ${c.maxUses}` : ""}</td>
                  <td className="p-3 text-white/50">{c.expiresAt ? new Date(c.expiresAt).toLocaleDateString("ru-RU") : "Бессрочно"}</td>
                  <td className="p-3">
                    {c.active ? (
                      <span className="text-green-400 text-xs font-semibold">Активен</span>
                    ) : (
                      <span className="text-white/30 text-xs font-semibold">Выключен</span>
                    )}
                  </td>
                  <td className="p-3">
                    <div className="flex gap-2">
                      <button onClick={() => handleToggleActive(c)} className="p-1.5 rounded-md hover:bg-white/10 text-white/60" title="Вкл/выкл">
                        <Power size={15} />
                      </button>
                      <button onClick={() => handleDelete(c)} className="p-1.5 rounded-md hover:bg-white/10 text-red-400">
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
