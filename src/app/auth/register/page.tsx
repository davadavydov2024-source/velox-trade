"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Mail, Lock, User, ExternalLink, MessageCircle, CheckCircle2, Sparkles } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { auth } from "@/lib/firebase";
import { useToast } from "@/lib/toastContext";
import { getFeatureFlags } from "@/lib/featureFlags";
import { DEFAULT_FEATURE_FLAGS, FeatureFlags } from "@/types";
import { createTelegramRegisterRequest } from "@/lib/telegramRegister";
import { useLanguage, useLanguageStore } from "@/lib/languageStore";
import { LANGUAGES } from "@/lib/i18n";
import { useMascot } from "@/lib/mascotContext";
import { AuthBackground } from "@/components/AuthBackground";

const TELEGRAM_BOT = process.env.NEXT_PUBLIC_TELEGRAM_BOT || "veloxtrade_robot";

function translateAuthError(code?: string) {
  switch (code) {
    case "auth/email-already-in-use":
      return "Этот email уже зарегистрирован";
    case "auth/invalid-email":
      return "Некорректный email";
    case "auth/weak-password":
      return "Слишком простой пароль";
    default:
      return "Ошибка регистрации. Попробуйте снова";
  }
}

function RegisterInner() {
  const { register } = useAuth();
  const { toast } = useToast();
  const { celebrate } = useMascot();
  const router = useRouter();
  const searchParams = useSearchParams();
  const refCode = searchParams.get("ref");
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
      toast("warning", "Пароль должен быть не короче 6 символов");
      return;
    }
    setLoading(true);
    try {
      await register(email, password, name, language);
      if (refCode) {
        try {
          const idToken = await auth.currentUser?.getIdToken();
          if (idToken) {
            await fetch("/api/auth/apply-referral", {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
              body: JSON.stringify({ code: refCode }),
            });
          }
        } catch {
          // Реферальный бонус не критичен для регистрации — молча игнорируем ошибку.
        }
      }
      toast("success", "Аккаунт создан! Письмо для подтверждения email отправлено.");
      celebrate("register");
      router.push("/profile");
    } catch (err: any) {
      toast("error", translateAuthError(err?.code));
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
        toast("error", "Нет доступа к базе данных. Проверь, что правила Firestore опубликованы.");
      } else {
        toast("error", "Не удалось начать регистрацию");
      }
    } finally {
      setTgCreating(false);
    }
  }

  if (!flagsLoaded) {
    return <div className="max-w-md mx-auto px-4 py-16 text-center text-white/40">Загрузка...</div>;
  }

  if (!flags.registrationEnabled) {
    return (
      <div className="relative min-h-[calc(100vh-64px)] flex items-center justify-center px-4 py-16">
        <AuthBackground />
        <div className="card auth-card-rise p-8 text-center max-w-md w-full">
          <h1 className="text-xl font-bold mb-2">Регистрация временно закрыта</h1>
          <p className="text-white/40 text-sm">
            Администратор временно отключил регистрацию новых аккаунтов. Попробуй зайти позже.
          </p>
          <Link href="/auth/login" className="text-accent hover:underline text-sm mt-4 inline-block">
            ← Ко входу
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-[calc(100vh-64px)] flex items-center justify-center px-4 py-16">
      <AuthBackground />

      <div className="auth-card-rise max-w-md w-full">
        <div className="auth-glow-border rounded-card">
        <div className="card p-8 relative overflow-hidden z-[1]">
          {/* Тонкое свечение по верхнему краю карточки — просто декоративная полоска, оживляет
             иначе плоский верх card. */}
          <div
            className="absolute top-0 left-0 right-0 h-[2px] opacity-70"
            style={{ background: "linear-gradient(90deg, transparent, var(--color-accent), transparent)" }}
          />

          <div className="flex items-center gap-2 mb-1">
            <Sparkles size={20} className="text-accent shrink-0" />
            <h1
              className="text-2xl font-bold auth-title-sheen bg-clip-text text-transparent"
              style={{ backgroundImage: "linear-gradient(90deg, #fff, var(--color-accent-light), #fff)" }}
            >
              {t("auth_register_title")}
            </h1>
          </div>
          <p className="text-white/40 text-sm mb-6">{t("auth_register_subtitle")}</p>

          <div className="mb-6">
            <p className="text-xs text-white/40 mb-2">{t("auth_language_label")}</p>
            <div className="flex gap-2">
              {LANGUAGES.map((l) => (
                <button
                  key={l.code}
                  type="button"
                  onClick={() => setLanguage(l.code)}
                  className={`flex-1 py-2 rounded-btn text-sm flex items-center justify-center gap-1.5 transition-all duration-200 ${
                    language === l.code ? "bg-accent text-black scale-[1.02]" : "bg-surface text-white/60 hover:bg-white/10"
                  }`}
                >
                  <span>{l.flag}</span> {l.label}
                </button>
              ))}
            </div>
          </div>

          {flags.telegramRegisterEnabled && (
            <div className="relative flex mb-6 bg-surface rounded-btn p-1">
              {/* Двигающаяся плашка под активным табом вместо мгновенной смены цвета фона */}
              <div
                className="absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-btn bg-accent transition-transform duration-300 ease-out"
                style={{ transform: mode === "password" ? "translateX(0)" : "translateX(calc(100% + 8px))" }}
              />
              <button
                onClick={() => setMode("password")}
                className={`relative z-10 flex-1 py-2 rounded-btn text-sm font-medium transition-colors duration-200 ${
                  mode === "password" ? "text-black" : "text-white/60"
                }`}
              >
                Email и пароль
              </button>
              <button
                onClick={() => setMode("telegram")}
                className={`relative z-10 flex-1 py-2 rounded-btn text-sm font-medium flex items-center justify-center gap-1.5 transition-colors duration-200 ${
                  mode === "telegram" ? "text-black" : "text-white/60"
                }`}
              >
                <MessageCircle size={14} /> Через Telegram
              </button>
            </div>
          )}

          {mode === "password" || !flags.telegramRegisterEnabled ? (
            <form onSubmit={handleSubmit} className="space-y-4 auth-pill-pop">
              <div className="relative group">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 group-focus-within:text-accent transition-colors" size={18} />
                <input
                  required
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("auth_name_placeholder")}
                  className="input-field pl-10 focus:ring-2 focus:ring-accent/30 transition-shadow"
                />
              </div>
              <div className="relative group">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 group-focus-within:text-accent transition-colors" size={18} />
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t("auth_email_placeholder")}
                  className="input-field pl-10 focus:ring-2 focus:ring-accent/30 transition-shadow"
                />
              </div>
              <div className="relative group">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 group-focus-within:text-accent transition-colors" size={18} />
                <input
                  type="password"
                  required
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t("auth_password_placeholder")}
                  className="input-field pl-10 focus:ring-2 focus:ring-accent/30 transition-shadow"
                />
              </div>
              <label className="flex items-start gap-2 text-xs text-white/50">
                <input type="checkbox" required checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5" />
                <span>
                  Я согласен с{" "}
                  <Link href="/rules" target="_blank" className="text-accent hover:underline">
                    правилами платформы
                  </Link>
                  ,{" "}
                  <Link href="/privacy" target="_blank" className="text-accent hover:underline">
                    политикой конфиденциальности
                  </Link>{" "}
                  и{" "}
                  <Link href="/terms" target="_blank" className="text-accent hover:underline">
                    пользовательским соглашением
                  </Link>
                  .
                </span>
              </label>
              <button
                disabled={loading || !agreed}
                className="btn-primary w-full py-3 disabled:opacity-50 hover:shadow-[0_0_24px_-4px_var(--color-accent)] transition-shadow"
              >
                {loading ? t("auth_submit_creating") : t("auth_submit_register")}
              </button>
            </form>
          ) : tgConfirmed ? (
            <div className="text-center py-4 space-y-4 auth-pill-pop">
              <CheckCircle2 className="mx-auto text-green-400 animate-[fadeIn_0.4s_ease-out]" size={36} />
              <p className="text-sm text-white/70">
                Аккаунт создан! Код для входа уже отправлен тебе в Telegram — введи его на странице входа.
              </p>
              <Link href="/auth/login" className="btn-primary inline-block px-6 py-3 text-sm">
                Перейти ко входу
              </Link>
            </div>
          ) : tgLinkUrl ? (
            <div className="space-y-3 text-center py-2 auth-pill-pop">
              <div className="relative w-14 h-14 mx-auto">
                <div className="absolute inset-0 rounded-full border-2 border-accent/20 border-t-accent auth-spin-slow" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <MessageCircle size={22} className="text-accent" />
                </div>
              </div>
              <a
                href={tgLinkUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary px-6 py-3 text-sm inline-flex items-center gap-2 hover:shadow-[0_0_24px_-4px_var(--color-accent)] transition-shadow"
              >
                Открыть Telegram-бота <ExternalLink size={14} />
              </a>
              <p className="text-xs text-white/40">
                Нажми «Start» в боте — аккаунт создастся автоматически, и мы пришлём код для входа прямо туда. Эта
                страница обновится сама.
              </p>
              <div className="flex items-center justify-center gap-2 text-xs text-white/30 pt-2">
                <span className="w-2 h-2 rounded-full bg-accent animate-pulse" /> Ждём подтверждения...
              </div>
            </div>
          ) : (
            <form onSubmit={handleStartTelegramRegister} className="space-y-4 auth-pill-pop">
              <div className="relative group">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 group-focus-within:text-accent transition-colors" size={18} />
                <input
                  required
                  autoComplete="name"
                  value={tgName}
                  onChange={(e) => setTgName(e.target.value)}
                  placeholder="Имя пользователя"
                  className="input-field pl-10 focus:ring-2 focus:ring-accent/30 transition-shadow"
                />
              </div>
              <div className="relative group">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 group-focus-within:text-accent transition-colors" size={18} />
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={tgEmail}
                  onChange={(e) => setTgEmail(e.target.value)}
                  placeholder="Email"
                  className="input-field pl-10 focus:ring-2 focus:ring-accent/30 transition-shadow"
                />
              </div>
              <button
                disabled={tgCreating}
                className="btn-primary w-full py-3 disabled:opacity-50 hover:shadow-[0_0_24px_-4px_var(--color-accent)] transition-shadow"
              >
                {tgCreating ? "Готовим ссылку..." : "Продолжить в Telegram"}
              </button>
              <p className="text-xs text-white/30 text-center">Без пароля — вход будет по коду из Telegram.</p>
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
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense
      fallback={
        <div className="relative min-h-[calc(100vh-64px)] flex items-center justify-center px-4">
          <AuthBackground />
          <p className="text-white/40">Загрузка...</p>
        </div>
      }
    >
      <RegisterInner />
    </Suspense>
  );
}
