"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Mail, Lock, User, ExternalLink, MessageCircle, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { useToast } from "@/lib/toastContext";
import { getFeatureFlags } from "@/lib/featureFlags";
import { DEFAULT_FEATURE_FLAGS, FeatureFlags } from "@/types";
import { createTelegramRegisterRequest } from "@/lib/telegramRegister";
import { useLanguage, useLanguageStore } from "@/lib/languageStore";
import { LANGUAGES } from "@/lib/i18n";

const TELEGRAM_BOT = process.env.NEXT_PUBLIC_TELEGRAM_BOT || "veloxtrade_robot";

function translateAuthError(t: (key: string) => string, code?: string) {
  switch (code) {
    case "auth/email-already-in-use":
      return t("auth_error_email_in_use");
    case "auth/invalid-email":
      return t("auth_error_invalid_email");
    case "auth/weak-password":
      return t("auth_error_weak_password");
    default:
      return t("auth_error_generic");
  }
}

export default function RegisterPage() {
  const { register } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const { t } = useLanguage();
  const language = useLanguageStore((s) => s.language);
  const setLanguage = useLanguageStore((s) => s.setLanguage);

  const [flags, setFlags] = useState<FeatureFlags>(DEFAULT_FEATURE_FLAGS);
  const [flagsLoaded, setFlagsLoaded] = useState(false);
  const [mode, setMode] = useState<"password" | "telegram">("password");

  useEffect(() => {
    getFeatureFlags().then((f) => {
      setFlags(f);
      setFlagsLoaded(true);
      if (!f.telegramRegisterEnabled) setMode("password");
    });
  }, []);

  // --- регистрация по паролю ---
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);

  // --- регистрация через Telegram ---
  const [tgName, setTgName] = useState("");
  const [tgEmail, setTgEmail] = useState("");
  const [tgLinkUrl, setTgLinkUrl] = useState<string | null>(null);
  const [tgCode, setTgCode] = useState<string | null>(null);
  const [tgCreating, setTgCreating] = useState(false);
  const [tgConfirmed, setTgConfirmed] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) {
      toast("warning", t("register_toast_short_password"));
      return;
    }
    setLoading(true);
    try {
      await register(email, password, name, language);
      toast("success", t("register_toast_created"));
      router.push("/profile");
    } catch (err: any) {
      toast("error", translateAuthError(t, err?.code));
    } finally {
      setLoading(false);
    }
  }

  async function handleStartTelegramRegister(e: React.FormEvent) {
    e.preventDefault();
    setTgCreating(true);
    try {
      const code = await createTelegramRegisterRequest(tgEmail, tgName);
      setTgCode(code);
      setTgLinkUrl(`https://t.me/${TELEGRAM_BOT}?start=${code}`);

      pollRef.current = setInterval(async () => {
        try {
          const res = await fetch(`/api/telegram/register-status?code=${code}`);
          const data = await res.json();
          if (data.done) {
            setTgConfirmed(true);
            if (pollRef.current) clearInterval(pollRef.current);
          }
        } catch {
          // сеть моргнула — просто попробуем на следующем тике
        }
      }, 3000);
    } catch (err: any) {
      if (err?.code === "permission-denied") {
        toast("error", t("register_toast_no_permission"));
      } else {
        toast("error", t("register_toast_start_failed"));
      }
    } finally {
      setTgCreating(false);
    }
  }

  if (!flagsLoaded) {
    return <div className="max-w-md mx-auto px-4 py-16 text-center text-white/40">{t("common_loading")}</div>;
  }

  if (!flags.registrationEnabled) {
    return (
      <div className="max-w-md mx-auto px-4 py-16">
        <div className="card p-8 text-center">
          <h1 className="text-xl font-bold mb-2">{t("register_disabled_title")}</h1>
          <p className="text-white/40 text-sm">{t("register_disabled_body")}</p>
          <Link href="/auth/login" className="text-accent hover:underline text-sm mt-4 inline-block">
            {t("register_back_to_login")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto px-4 py-16">
      <div className="card p-8">
        <h1 className="text-2xl font-bold mb-1">{t("auth_register_title")}</h1>
        <p className="text-white/40 text-sm mb-6">{t("auth_register_subtitle")}</p>

        <div className="mb-6">
          <p className="text-xs text-white/40 mb-2">{t("auth_language_label")}</p>
          <div className="flex gap-2">
            {LANGUAGES.map((l) => (
              <button
                key={l.code}
                type="button"
                onClick={() => setLanguage(l.code)}
                className={`flex-1 py-2 rounded-btn text-sm flex items-center justify-center gap-1.5 transition-colors ${
                  language === l.code ? "bg-accent text-black" : "bg-surface text-white/60"
                }`}
              >
                <span>{l.flag}</span> {l.label}
              </button>
            ))}
          </div>
        </div>

        {flags.telegramRegisterEnabled && (
          <div className="flex gap-2 mb-6">
            <button
              onClick={() => setMode("password")}
              className={`flex-1 py-2 rounded-btn text-sm font-medium transition-colors ${
                mode === "password" ? "bg-accent text-black" : "bg-surface text-white/60"
              }`}
            >
              {t("register_email_mode")}
            </button>
            <button
              onClick={() => setMode("telegram")}
              className={`flex-1 py-2 rounded-btn text-sm font-medium flex items-center justify-center gap-1.5 transition-colors ${
                mode === "telegram" ? "bg-accent text-black" : "bg-surface text-white/60"
              }`}
            >
              <MessageCircle size={14} /> {t("register_telegram_mode")}
            </button>
          </div>
        )}

        {mode === "password" || !flags.telegramRegisterEnabled ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" size={18} />
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("auth_name_placeholder")}
                className="input-field pl-10"
              />
            </div>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" size={18} />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("auth_email_placeholder")}
                className="input-field pl-10"
              />
            </div>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" size={18} />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t("auth_password_placeholder")}
                className="input-field pl-10"
              />
            </div>
            <label className="flex items-start gap-2 text-xs text-white/50">
              <input type="checkbox" required checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5" />
              <span>
                {t("register_agree_prefix")}{" "}
                <Link href="/rules" target="_blank" className="text-accent hover:underline">
                  {t("register_agree_rules")}
                </Link>{" "}
                {t("register_agree_suffix")}
              </span>
            </label>
            <button disabled={loading || !agreed} className="btn-primary w-full py-3 disabled:opacity-50">
              {loading ? t("auth_submit_creating") : t("auth_submit_register")}
            </button>
          </form>
        ) : tgConfirmed ? (
          <div className="text-center py-4 space-y-4">
            <CheckCircle2 className="mx-auto text-green-400" size={36} />
            <p className="text-sm text-white/70">{t("register_tg_confirmed")}</p>
            <Link href="/auth/login" className="btn-primary inline-block px-6 py-3 text-sm">
              {t("register_tg_go_to_login")}
            </Link>
          </div>
        ) : tgLinkUrl ? (
          <div className="space-y-3 text-center py-2">
            <a
              href={tgLinkUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary px-6 py-3 text-sm inline-flex items-center gap-2"
            >
              {t("register_tg_open_bot")} <ExternalLink size={14} />
            </a>
            <p className="text-xs text-white/40">{t("register_tg_waiting_hint")}</p>
            <div className="flex items-center justify-center gap-2 text-xs text-white/30 pt-2">
              <span className="w-2 h-2 rounded-full bg-accent animate-pulse" /> {t("register_tg_waiting")}
            </div>
          </div>
        ) : (
          <form onSubmit={handleStartTelegramRegister} className="space-y-4">
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" size={18} />
              <input
                required
                value={tgName}
                onChange={(e) => setTgName(e.target.value)}
                placeholder={t("register_tg_name_placeholder")}
                className="input-field pl-10"
              />
            </div>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" size={18} />
              <input
                type="email"
                required
                value={tgEmail}
                onChange={(e) => setTgEmail(e.target.value)}
                placeholder={t("login_email_placeholder")}
                className="input-field pl-10"
              />
            </div>
            <button disabled={tgCreating} className="btn-primary w-full py-3 disabled:opacity-50">
              {tgCreating ? t("register_tg_preparing") : t("register_tg_continue")}
            </button>
            <p className="text-xs text-white/30 text-center">{t("register_tg_no_password_hint")}</p>
          </form>
        )}

        <p className="text-center text-sm text-white/40 mt-6">
          {t("auth_have_account")}{" "}
          <Link href="/auth/login" className="text-accent hover:underline">
            {t("auth_login_link")}
          </Link>
        </p>
      </div>
    </div>
  );
}
