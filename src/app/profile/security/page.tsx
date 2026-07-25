"use client";

import { useEffect, useState } from "react";
import { sendEmailVerification } from "firebase/auth";
import { useAuth } from "@/lib/authContext";
import { useToast } from "@/lib/toastContext";
import { useLanguage } from "@/lib/languageStore";
import { tf, t as translate, Language } from "@/lib/i18n";

function translateAuthError(lang: Language, code?: string) {
  switch (code) {
    case "auth/too-many-requests":
      return translate(lang, "security_error_too_many_requests");
    case "auth/user-token-expired":
    case "auth/requires-recent-login":
      return translate(lang, "security_error_session_expired");
    case "auth/network-request-failed":
      return translate(lang, "security_error_network");
    default:
      return translate(lang, "security_error_generic");
  }
}

export default function SecurityPage() {
  const { t, language } = useLanguage();
  const { user, profile, resetPassword, refreshProfile } = useAuth();
  const { toast } = useToast();
  const [sending, setSending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [checking, setChecking] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function resendVerification() {
    if (!user || cooldown > 0) return;
    setSending(true);
    try {
      await sendEmailVerification(user);
      toast("success", t("security_toast_resent"));
      setCooldown(60);
    } catch (err: any) {
      toast("error", translateAuthError(language, err?.code));
      if (err?.code === "auth/too-many-requests") setCooldown(60);
    } finally {
      setSending(false);
    }
  }

  async function checkVerification() {
    setChecking(true);
    try {
      const updated = await refreshProfile();
      toast(updated?.emailVerified ? "success" : "warning", updated?.emailVerified ? t("security_toast_email_verified") : t("security_toast_email_not_yet"));
    } finally {
      setChecking(false);
    }
  }

  async function handleResetPassword() {
    if (!profile) return;
    setResettingPassword(true);
    try {
      await resetPassword(profile.email);
      toast("success", t("security_toast_reset_sent"));
    } catch (err: any) {
      console.error("Сброс пароля не удался:", err);
      const status = err?.status;
      if (status === 403 || status === 401) {
        toast("error", t("security_error_emailjs_403"));
      } else if (status === 400) {
        toast("error", t("security_error_emailjs_400"));
      } else {
        toast("error", err?.message || err?.text || t("security_error_generic"));
      }
    } finally {
      setResettingPassword(false);
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold mb-2">{t("security_title")}</h1>

      <div className="card p-5 flex items-center justify-between gap-3">
        <div>
          <p className="font-medium">{t("security_email_verify_title")}</p>
          <p className="text-sm text-white/40">{profile?.emailVerified ? t("security_email_verified") : t("security_email_not_verified")}</p>
        </div>
        {!profile?.emailVerified && (
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={checkVerification} disabled={checking} className="text-xs text-white/40 hover:text-white/70 underline underline-offset-2 disabled:opacity-50">
              {checking ? t("security_checking") : t("security_check_verified")}
            </button>
            <button onClick={resendVerification} disabled={sending || cooldown > 0} className="btn-secondary px-4 py-2 text-sm disabled:opacity-50">
              {sending ? t("security_sending") : cooldown > 0 ? tf(language, "security_resend_in", { s: cooldown }) : t("security_send_email")}
            </button>
          </div>
        )}
      </div>

      <div className="card p-5 flex items-center justify-between">
        <div>
          <p className="font-medium">{t("security_password_title")}</p>
          <p className="text-sm text-white/40">{t("security_password_hint")}</p>
        </div>
        <button onClick={handleResetPassword} disabled={resettingPassword} className="btn-secondary px-4 py-2 text-sm disabled:opacity-50">
          {resettingPassword ? t("security_sending") : t("security_change_password")}
        </button>
      </div>
    </div>
  );
}
