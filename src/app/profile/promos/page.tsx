"use client";

import { useState } from "react";
import { Gift, Sparkles } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { useToast } from "@/lib/toastContext";
import { redeemGiftCode } from "@/lib/promoCodes";
import { useLanguage } from "@/lib/languageStore";
import { tf } from "@/lib/i18n";

export default function PromoGiftsPage() {
  const { t, language } = useLanguage();
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
        toast("success", tf(language, "promos_toast_balance", { amount: promo.giftBalance ?? 0 }));
      } else {
        toast("success", tf(language, "promos_toast_product", { name: promo.giftProductName ?? "" }));
      }
      setCode("");
      await refreshProfile();
    } catch (err: any) {
      toast("error", err?.message ?? t("promos_toast_failed"));
    } finally {
      setRedeeming(false);
    }
  }

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Gift size={20} className="text-accent" /> {t("promos_title")}
        </h1>
        <p className="text-white/40 text-sm mt-1">{t("promos_intro")}</p>
      </div>

      <form onSubmit={handleRedeem} className="card p-5 space-y-3">
        <div className="flex items-center gap-2 text-sm text-white/50 mb-1">
          <Sparkles size={15} className="text-accent" /> {t("promos_activate_label")}
        </div>
        <div className="flex gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder={t("promos_placeholder")}
            className="input-field py-2.5 text-sm flex-1 uppercase"
          />
          <button disabled={redeeming || !code.trim()} className="btn-primary px-5 py-2.5 text-sm disabled:opacity-50">
            {redeeming ? t("promos_activating") : t("promos_activate_button")}
          </button>
        </div>
      </form>

      <p className="text-xs text-white/30">{t("promos_note")}</p>
    </div>
  );
}
