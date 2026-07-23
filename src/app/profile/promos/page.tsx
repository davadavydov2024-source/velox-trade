"use client";

import { useState } from "react";
import { Gift, Sparkles } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { useToast } from "@/lib/toastContext";
import { redeemGiftCode } from "@/lib/promoCodes";

export default function PromoGiftsPage() {
  const { user, refreshProfile } = useAuth();
  const { toast } = useToast();
  const [code, setCode] = useState("");
  const [redeeming, setRedeeming] = useState(false);

  async function handleRedeem(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !code.trim()) return;
    setRedeeming(true);
    try {
      const promo = await redeemGiftCode(code, user.uid);
      if (promo.giftType === "balance") {
        toast("success", `Промо-подарок активирован! На баланс зачислено ${promo.giftBalance} ₽.`);
      } else {
        toast("success", `Промо-подарок активирован! Предмет «${promo.giftProductName}» уже в истории покупок.`);
      }
      setCode("");
      await refreshProfile();
    } catch (err: any) {
      toast("error", err?.message ?? "Не удалось активировать промокод");
    } finally {
      setRedeeming(false);
    }
  }

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Gift size={20} className="text-accent" /> Промо-подарки
        </h1>
        <p className="text-white/40 text-sm mt-1">
          Введи промокод, чтобы сразу получить подарок — пополнение баланса или бесплатный предмет из каталога.
          Каждый код можно использовать один раз.
        </p>
      </div>

      <form onSubmit={handleRedeem} className="card p-5 space-y-3">
        <div className="flex items-center gap-2 text-sm text-white/50 mb-1">
          <Sparkles size={15} className="text-accent" /> Активировать промо-подарок
        </div>
        <div className="flex gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="Промокод"
            className="input-field py-2.5 text-sm flex-1 uppercase"
          />
          <button disabled={redeeming || !code.trim()} className="btn-primary px-5 py-2.5 text-sm disabled:opacity-50">
            {redeeming ? "Активируем..." : "Активировать"}
          </button>
        </div>
      </form>

      <p className="text-xs text-white/30">
        Промокоды на скидку (для заказов) вводятся отдельно — в корзине при оформлении покупки.
      </p>
    </div>
  );
}
