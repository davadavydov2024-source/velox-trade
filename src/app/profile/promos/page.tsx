"use client";

import { useEffect, useState } from "react";
import { Gift, Sparkles, Users, Copy } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { useToast } from "@/lib/toastContext";
import { redeemGiftCode } from "@/lib/promoCodes";
import { getOrCreateReferralCode } from "@/lib/users";
import { getFeatureFlags } from "@/lib/featureFlags";
import { DEFAULT_FEATURE_FLAGS } from "@/types";

export default function PromoGiftsPage() {
  const { user, profile, refreshProfile } = useAuth();
  const { toast } = useToast();
  const [code, setCode] = useState("");
  const [redeeming, setRedeeming] = useState(false);
  const [referralBonus, setReferralBonus] = useState(DEFAULT_FEATURE_FLAGS.referralBonusRub);
  const [referralCode, setReferralCode] = useState<string | null>(profile?.referralCode ?? null);

  useEffect(() => {
    getFeatureFlags().then((f) => setReferralBonus(f.referralBonusRub));
  }, []);

  useEffect(() => {
    if (!user) return;
    if (profile?.referralCode) {
      setReferralCode(profile.referralCode);
      return;
    }
    // У пользователей, созданных до появления реферальной системы, кода ещё нет — создаём при заходе на страницу.
    getOrCreateReferralCode(user.uid)
      .then((c) => {
        setReferralCode(c);
        refreshProfile();
      })
      .catch((err) => {
        console.error("Не удалось создать реферальный код:", err);
        toast("error", "Не удалось получить реферальную ссылку — попробуй обновить страницу");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, profile?.referralCode]);

  const referralLink = referralCode && typeof window !== "undefined" ? `${window.location.origin}/auth/register?ref=${referralCode}` : "";

  function copyReferralLink() {
    if (!referralLink) return;
    navigator.clipboard.writeText(referralLink);
    toast("success", "Ссылка скопирована");
  }

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

      <div className="card p-5 space-y-3">
        <div className="flex items-center gap-2 text-sm text-white/50 mb-1">
          <Users size={15} className="text-accent" /> Пригласи друга
        </div>
        <p className="text-sm text-white/40">
          Отправь другу свою ссылку — когда он зарегистрируется по ней, вы оба получите по {referralBonus} ₽ на баланс.
        </p>
        {referralLink ? (
          <div className="flex gap-2">
            <input readOnly value={referralLink} className="input-field py-2.5 text-sm flex-1" />
            <button onClick={copyReferralLink} className="btn-secondary px-4 py-2.5 text-sm flex items-center gap-1.5 shrink-0">
              <Copy size={14} /> Скопировать
            </button>
          </div>
        ) : (
          <p className="text-sm text-white/30">Загрузка ссылки...</p>
        )}
      </div>
    </div>
  );
}
