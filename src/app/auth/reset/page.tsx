"use client";

import { useState } from "react";
import Link from "next/link";
import { Mail } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { useToast } from "@/lib/toastContext";
import { useLanguage } from "@/lib/languageStore";
import { tf } from "@/lib/i18n";

export default function ResetPasswordPage() {
  const { t, language } = useLanguage();
  const { resetPassword } = useAuth();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await resetPassword(email);
      setSent(true);
      toast("success", t("reset_toast_sent"));
    } catch (err: any) {
      toast("error", err?.message || t("reset_toast_failed"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-md mx-auto px-4 py-16">
      <div className="card p-8">
        <h1 className="text-2xl font-bold mb-1">{t("reset_title")}</h1>
        <p className="text-white/40 text-sm mb-6">{t("reset_subtitle")}</p>

        {sent ? (
          <p className="text-green-400 text-sm">{tf(language, "reset_sent", { email })}</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" size={18} />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("login_email_placeholder")}
                className="input-field pl-10"
              />
            </div>
            <button disabled={loading} className="btn-primary w-full py-3 disabled:opacity-50">
              {loading ? t("reset_submitting") : t("reset_submit")}
            </button>
          </form>
        )}

        <p className="text-center text-sm text-white/40 mt-6">
          <Link href="/auth/login" className="text-accent hover:underline">
            {t("reset_back_to_login")}
          </Link>
        </p>
      </div>
    </div>
  );
}
