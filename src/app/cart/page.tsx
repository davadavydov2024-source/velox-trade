"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { Minus, Plus, Trash2, Tag } from "lucide-react";
import { useCart } from "@/lib/cartStore";
import { useAuth } from "@/lib/authContext";
import { useToast } from "@/lib/toastContext";
import { createOrder, adjustUserBalance } from "@/lib/users";
import { safeImageSrc } from "@/lib/safeImage";
import { useRouter } from "next/navigation";

const PROMO_CODES: Record<string, number> = {
  VELOX10: 10,
  WELCOME5: 5,
};

export default function CartPage() {
  const { lines, remove, setQuantity, clear, total } = useCart();
  const { user, profile, refreshProfile } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const [promo, setPromo] = useState("");
  const [discount, setDiscount] = useState(0);
  const [placing, setPlacing] = useState(false);

  const subtotal = total();
  const finalTotal = +(subtotal * (1 - discount / 100)).toFixed(2);

  function applyPromo() {
    const code = promo.trim().toUpperCase();
    if (PROMO_CODES[code]) {
      setDiscount(PROMO_CODES[code]);
      toast("success", `Промокод применён: -${PROMO_CODES[code]}%`);
    } else {
      toast("error", "Промокод не найден");
    }
  }

  async function checkout() {
    if (!user || !profile) {
      toast("warning", "Войдите в аккаунт, чтобы оформить заказ");
      router.push("/auth/login");
      return;
    }
    if (lines.length === 0) return;
    if (profile.balance < finalTotal) {
      toast("error", "Недостаточно средств на балансе. Пополните баланс.");
      router.push("/profile/topup");
      return;
    }
    setPlacing(true);
    try {
      // Товары могут принадлежать разным продавцам — группируем по продавцу
      // и создаём отдельный заказ на каждого, чтобы чат/подтверждение/отзыв были привязаны к конкретной сделке.
      const bySeller = new Map<string, typeof lines>();
      for (const line of lines) {
        const sellerId = line.product.sellerId || "store";
        const group = bySeller.get(sellerId) ?? [];
        group.push(line);
        bySeller.set(sellerId, group);
      }

      const discountRatio = subtotal > 0 ? finalTotal / subtotal : 1;

      for (const [sellerId, group] of bySeller) {
        const groupSubtotal = group.reduce((sum, l) => sum + l.product.price * l.quantity, 0);
        await createOrder({
          userId: user.uid,
          sellerId,
          items: group.map((l) => ({ productId: l.product.id, name: l.product.name, price: l.product.price, quantity: l.quantity })),
          total: +(groupSubtotal * discountRatio).toFixed(2),
          status: "pending_confirmation",
        });
      }

      await adjustUserBalance(user.uid, -finalTotal);
      await refreshProfile();
      clear();
      toast("success", "Заказ оформлен! Подтверди получение предмета в истории заказов, когда получишь его.");
      router.push("/profile/orders");
    } catch (e) {
      toast("error", "Не удалось оформить заказ. Попробуйте снова.");
    } finally {
      setPlacing(false);
    }
  }

  if (lines.length === 0) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-24 text-center">
        <p className="text-white/40 mb-6">Корзина пуста.</p>
        <Link href="/catalog" className="btn-primary px-6 py-3 inline-block">
          Перейти в каталог
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
      <h1 className="text-2xl font-bold mb-6">Корзина</h1>
      <div className="grid md:grid-cols-[1fr_320px] gap-8">
        <div className="space-y-3">
          {lines.map((line) => (
            <div key={line.product.id} className="card p-4 flex items-center gap-4">
              <div className="relative w-16 h-16 rounded-xl bg-black/30 shrink-0">
                <Image src={safeImageSrc(line.product.image)} alt={line.product.name} fill className="object-contain p-2" sizes="64px" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{line.product.name}</p>
                <p className="text-accent font-bold">{line.product.price} ₽</p>
              </div>
              <div className="flex items-center gap-2">
                <button className="btn-secondary p-2" onClick={() => setQuantity(line.product.id, line.quantity - 1)}>
                  <Minus size={14} />
                </button>
                <span className="w-8 text-center">{line.quantity}</span>
                <button className="btn-secondary p-2" onClick={() => setQuantity(line.product.id, line.quantity + 1)}>
                  <Plus size={14} />
                </button>
              </div>
              <button className="text-red-400 hover:text-red-300 p-2" onClick={() => remove(line.product.id)}>
                <Trash2 size={18} />
              </button>
            </div>
          ))}
        </div>

        <div className="card p-5 h-fit space-y-4">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Tag className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" size={16} />
              <input
                value={promo}
                onChange={(e) => setPromo(e.target.value)}
                placeholder="Промокод"
                className="input-field pl-9 py-2 text-sm"
              />
            </div>
            <button onClick={applyPromo} className="btn-secondary px-4 text-sm">
              Применить
            </button>
          </div>

          <div className="space-y-2 text-sm border-t border-border pt-4">
            <div className="flex justify-between text-white/50">
              <span>Подытог</span>
              <span>{subtotal.toFixed(2)} ₽</span>
            </div>
            {discount > 0 && (
              <div className="flex justify-between text-green-400">
                <span>Скидка ({discount}%)</span>
                <span>-{(subtotal - finalTotal).toFixed(2)} ₽</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-lg border-t border-border pt-2">
              <span>Итого</span>
              <span className="text-accent">{finalTotal.toFixed(2)} ₽</span>
            </div>
          </div>

          <button onClick={checkout} disabled={placing} className="btn-primary w-full py-3 disabled:opacity-50">
            {placing ? "Оформляем..." : "Оплатить с баланса"}
          </button>
          {profile && <p className="text-xs text-white/30 text-center">Баланс: {profile.balance.toFixed(2)} ₽</p>}
        </div>
      </div>
    </div>
  );
}
