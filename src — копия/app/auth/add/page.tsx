"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Mail, Lock, Eye, EyeOff, UserPlus, Sparkles, ArrowLeft } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { useToast } from "@/lib/toastContext";
import { getFeatureFlags } from "@/lib/featureFlags";
import { DEFAULT_FEATURE_FLAGS, FeatureFlags } from "@/types";
import { AuthBackground } from "@/components/AuthBackground";
import { TelegramLoginWidget } from "@/components/TelegramLoginWidget";
import { cancelAddAccount, getPendingAdd } from "@/lib/accountSlots";

function translateAuthError(code?: string) {
  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
      return "Неверный email или пароль";
    case "auth/user-not-found":
      return "Пользователь с таким email не найден";
    case "auth/too-many-requests":
      return "Слишком много попыток. Попробуйте позже";
    default:
      return "Ошибка входа. Проверьте данные и попробуйте снова";
  }
}

/**
 * Экран «Добавить аккаунт» — в том же стиле, что и обычная регистрация/вход: фон, карточка с
 * подсветкой, способы входа (Telegram, Google, email) и ссылка на создание нового аккаунта.
 * Открывается на новом пустом слоте (см. beginAddAccount), поэтому вход/регистрация здесь не
 * затрагивают текущий аккаунт — он остаётся в списке переключателя.
 */
export default function AddAccountPage() {
  const router = useRouter();
  const { login, loginWithGoogle } = useAuth();
  const { toast } = useToast();
  const [flags, setFlags] = useState<FeatureFlags>(DEFAULT_FEATURE_FLAGS);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    getFeatureFlags().then(setFlags);
    // Страницу открыли напрямую (не через «Добавить аккаунт») — отправляем на обычный вход.
    if (!getPendingAdd()) router.replace("/auth/login");
    else setReady(true);
  }, [router]);

  function done() {
    toast("success", "Аккаунт добавлен!");
    router.push("/profile");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email.trim(), password);
      done();
    } catch (err: any) {
      toast("error", translateAuthError(err?.code));
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    try {
      await loginWithGoogle();
      done();
    } catch (err: any) {
      if (err?.code !== "auth/popup-closed-by-user" && err?.code !== "auth/cancelled-popup-request") {
        toast("error", "Не удалось войти через Google. Попробуй ещё раз.");
      }
    }
  }

  if (!ready) return null;

  return (
    <div className="relative min-h-[calc(100vh-64px)] flex items-center justify-center px-4 py-16">
      <AuthBackground />

      <div className="auth-card-rise max-w-md w-full">
        <div className="auth-glow-border rounded-card">
          <div className="card p-8 relative overflow-hidden z-[1]">
            <div
              className="absolute top-0 left-0 right-0 h-[2px] opacity-70"
              style={{ background: "linear-gradient(90deg, transparent, var(--color-accent), transparent)" }}
            />

            <div className="flex items-center gap-2 mb-1">
              <UserPlus size={20} className="text-accent shrink-0" />
              <h1
                className="text-2xl font-bold auth-title-sheen bg-clip-text text-transparent"
                style={{ backgroundImage: "linear-gradient(90deg, #fff, var(--color-accent-light), #fff)" }}
              >
                Добавить аккаунт
              </h1>
            </div>
            <p className="text-white/40 text-sm mb-6">
              Войди в другой аккаунт или создай новый — переключаться между ними можно в профиле.
            </p>

            {flags.telegramLoginEnabled && (
              <div className="space-y-2 mb-5">
                <TelegramLoginWidget onSuccess={done} />
                <p className="text-[11px] text-white/30 text-center">Вход и регистрация через Telegram в один клик</p>
              </div>
            )}

            {flags.googleLoginEnabled && (
              <button onClick={handleGoogle} className="btn-secondary w-full py-3 mb-5 flex items-center justify-center gap-2.5">
                <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
                  <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.9 2.4 30.4 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.5 17.7 9.5 24 9.5z" />
                  <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.6 5.9c4.4-4.1 7-10.1 7-17.6z" />
                  <path fill="#FBBC05" d="M10.5 28.7c-.5-1.5-.8-3-.8-4.7s.3-3.2.8-4.7l-7.9-6.1C.9 16.4 0 20.1 0 24s.9 7.6 2.6 10.8l7.9-6.1z" />
                  <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.9 2.3-8.3 2.3-6.3 0-11.6-4-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
                </svg>
                Войти через Google
              </button>
            )}

            {(flags.telegramLoginEnabled || flags.googleLoginEnabled) && (
              <div className="flex items-center gap-3 mb-5">
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs text-white/30">или по email</span>
                <div className="flex-1 h-px bg-border" />
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="relative group">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 group-focus-within:text-accent transition-colors" size={18} />
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email"
                  className="input-field pl-10 focus:ring-2 focus:ring-accent/30 transition-shadow"
                />
              </div>
              <div className="relative group">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 group-focus-within:text-accent transition-colors" size={18} />
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Пароль"
                  className="input-field pl-10 pr-11 focus:ring-2 focus:ring-accent/30 transition-shadow"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/70 transition-colors"
                  aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
              <button
                disabled={loading}
                className="btn-primary w-full py-3 disabled:opacity-50 hover:shadow-[0_0_24px_-4px_var(--color-accent)] transition-shadow"
              >
                {loading ? "Входим..." : "Войти и добавить"}
              </button>
            </form>

            <div className="mt-6 pt-5 border-t border-white/5 space-y-3 text-center">
              <Link
                href="/auth/register"
                className="inline-flex items-center justify-center gap-1.5 text-sm text-accent hover:underline"
              >
                <Sparkles size={14} /> Создать новый аккаунт
              </Link>
              <div>
                <button
                  type="button"
                  onClick={() => {
                    cancelAddAccount();
                    window.location.assign("/profile");
                  }}
                  className="inline-flex items-center gap-1 text-xs text-white/40 hover:text-white/70 transition-colors"
                >
                  <ArrowLeft size={13} /> Отмена, вернуться в профиль
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
