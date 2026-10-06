"use client";

import { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Mail, Lock, Send, MessageCircle, QrCode, Sparkles, Eye, EyeOff, RotateCw, Info } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { useToast } from "@/lib/toastContext";
import { getFeatureFlags } from "@/lib/featureFlags";
import { DEFAULT_FEATURE_FLAGS, FeatureFlags } from "@/types";
import { QrDeviceLogin } from "@/components/QrDeviceLogin";
import { AuthBackground } from "@/components/AuthBackground";

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

function LoginInner() {
  const { login, loginWithGoogle, loginWithCustomToken } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  // ?redirect= используется, когда сюда попали со страницы подтверждения входа с другого
  // устройства (/auth/link) — после логина нужно вернуться именно туда, а не в /profile.
  const redirectTo = searchParams.get("redirect") || "/profile";
  const [mode, setMode] = useState<"password" | "telegram" | "qr">("password");
  const [flags, setFlags] = useState<FeatureFlags>(DEFAULT_FEATURE_FLAGS);

  useEffect(() => {
    getFeatureFlags().then((f) => {
      setFlags(f);
      if (!f.telegramLoginEnabled) setMode("password");
    });
  }, []);

  // --- вход по паролю ---
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // --- вход по коду из Telegram ---
  const [tgEmail, setTgEmail] = useState("");
  const [tgCode, setTgCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [tgSending, setTgSending] = useState(false);
  const [tgVerifying, setTgVerifying] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  // Таймер до следующей отправки кода — чтобы не заваливали бота повторными запросами и было понятно,
  // когда можно запросить код ещё раз.
  useEffect(() => {
    if (resendIn <= 0) return;
    const id = setTimeout(() => setResendIn((n) => n - 1), 1000);
    return () => clearTimeout(id);
  }, [resendIn]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      toast("success", "Вы успешно вошли в аккаунт");
      router.push(redirectTo);
    } catch (err: any) {
      toast("error", translateAuthError(err?.code));
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    try {
      await loginWithGoogle();
      toast("success", "Вы успешно вошли через Google");
      router.push(redirectTo);
    } catch (err: any) {
      if (err?.code === "auth/popup-closed-by-user") return;
      if (err?.code === "auth/unauthorized-domain") {
        toast("error", "Этот домен не добавлен в Firebase Authentication → Settings → Authorized domains.");
      } else if (err?.code === "auth/popup-blocked") {
        toast("error", "Браузер заблокировал всплывающее окно входа. Разреши всплывающие окна для этого сайта.");
      } else {
        toast("error", "Не удалось войти через Google. Попробуй ещё раз.");
      }
    }
  }

  function handleRequestCode(e: React.FormEvent) {
    e.preventDefault();
    return requestCode();
  }

  async function requestCode() {
    setTgSending(true);
    try {
      const res = await fetch("/api/auth/request-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: tgEmail }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast("error", data.error ?? "Не удалось отправить код");
        return;
      }
      setCodeSent(true);
      setTgCode("");
      setResendIn(30);
      toast("success", "Код отправлен в Telegram. Проверь бота.");
    } catch {
      toast("error", "Не удалось связаться с сервером. Проверь подключение к интернету.");
    } finally {
      setTgSending(false);
    }
  }

  function handleVerifyCode(e: React.FormEvent) {
    e.preventDefault();
    return verifyCode(tgCode);
  }

  async function verifyCode(code: string) {
    if (tgVerifying) return;
    setTgVerifying(true);
    try {
      const res = await fetch("/api/auth/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: tgEmail, code }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast("error", data.error ?? "Неверный код");
        return;
      }
      await loginWithCustomToken(data.token);
      toast("success", "Вы успешно вошли по коду из Telegram");
      router.push(redirectTo);
    } catch {
      toast("error", "Не удалось войти. Попробуй ещё раз.");
    } finally {
      setTgVerifying(false);
    }
  }

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
            <Sparkles size={20} className="text-accent shrink-0" />
            <h1
              className="text-2xl font-bold auth-title-sheen bg-clip-text text-transparent"
              style={{ backgroundImage: "linear-gradient(90deg, #fff, var(--color-accent-light), #fff)" }}
            >
              Вход в аккаунт
            </h1>
          </div>
          <p className="text-white/40 text-sm mb-6">Рады видеть тебя снова в Velox Trade</p>

          <div className="relative flex mb-6 bg-surface rounded-btn p-1">
            {(() => {
              const tabs: readonly ("password" | "qr" | "telegram")[] = flags.telegramLoginEnabled
                ? ["password", "qr", "telegram"]
                : ["password", "qr"];
              const index = tabs.indexOf(mode);
              const n = tabs.length;
              return (
                <div
                  className="absolute top-1 bottom-1 rounded-btn bg-accent transition-all duration-300 ease-out"
                  style={{ left: `calc(${index} * (100% - 8px) / ${n} + 4px)`, width: `calc((100% - 8px) / ${n})` }}
                />
              );
            })()}
            <button
              onClick={() => setMode("password")}
              className={`relative z-10 flex-1 py-2 rounded-btn text-sm font-medium transition-colors duration-200 ${
                mode === "password" ? "text-black" : "text-white/60"
              }`}
            >
              Пароль
            </button>
            <button
              onClick={() => setMode("qr")}
              className={`relative z-10 flex-1 py-2 rounded-btn text-sm font-medium flex items-center justify-center gap-1.5 transition-colors duration-200 ${
                mode === "qr" ? "text-black" : "text-white/60"
              }`}
            >
              <QrCode size={14} /> По QR
            </button>
            {flags.telegramLoginEnabled && (
              <button
                onClick={() => setMode("telegram")}
                className={`relative z-10 flex-1 py-2 rounded-btn text-sm font-medium flex items-center justify-center gap-1.5 transition-colors duration-200 ${
                  mode === "telegram" ? "text-black" : "text-white/60"
                }`}
              >
                <MessageCircle size={14} /> Telegram
              </button>
            )}
          </div>

          <div className="auth-pill-pop" key={mode}>
          {mode === "qr" ? (
            <QrDeviceLogin onSuccess={() => router.push(redirectTo)} />
          ) : mode === "password" ? (
            <>
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
                <div className="text-right">
                  <Link href="/auth/reset" className="text-xs text-accent hover:underline">
                    Забыли пароль?
                  </Link>
                </div>
                <button
                  disabled={loading}
                  className="btn-primary w-full py-3 disabled:opacity-50 hover:shadow-[0_0_24px_-4px_var(--color-accent)] transition-shadow"
                >
                  {loading ? "Входим..." : "Войти"}
                </button>
              </form>

              {flags.googleLoginEnabled && (
                <>
                  <div className="flex items-center gap-3 my-5">
                    <div className="flex-1 h-px bg-border" />
                    <span className="text-xs text-white/30">или</span>
                    <div className="flex-1 h-px bg-border" />
                  </div>

                  <div className="space-y-2">
                    <button onClick={handleGoogle} className="btn-secondary w-full py-3 flex items-center justify-center gap-2.5">
                      <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
                        <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.9 2.4 30.4 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.5 17.7 9.5 24 9.5z"/>
                        <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.6 5.9c4.4-4.1 7-10.1 7-17.6z"/>
                        <path fill="#FBBC05" d="M10.5 28.7c-.5-1.5-.8-3-.8-4.7s.3-3.2.8-4.7l-7.9-6.1C.9 16.4 0 20.1 0 24s.9 7.6 2.6 10.8l7.9-6.1z"/>
                        <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.9 2.3-8.3 2.3-6.3 0-11.6-4-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/>
                      </svg>
                      Войти через Google
                    </button>
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="space-y-4">
              <div className="flex gap-2.5 p-3 rounded-btn bg-accent/[0.06] border border-accent/15">
                <Info size={15} className="text-accent shrink-0 mt-0.5" />
                <p className="text-xs text-white/55 leading-relaxed">
                  Работает, если Telegram уже привязан к аккаунту. Привязать его можно при регистрации или в «Профиль →
                  Безопасность».
                </p>
              </div>
              {!codeSent ? (
                <form onSubmit={handleRequestCode} className="space-y-4">
                  <div className="relative group">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 group-focus-within:text-accent transition-colors" size={18} />
                    <input
                      type="email"
                      required
                      autoComplete="email"
                      value={tgEmail}
                      onChange={(e) => setTgEmail(e.target.value)}
                      placeholder="Email аккаунта"
                      className="input-field pl-10 focus:ring-2 focus:ring-accent/30 transition-shadow"
                    />
                  </div>
                  <button
                    disabled={tgSending}
                    className="btn-primary w-full py-3 flex items-center justify-center gap-2 disabled:opacity-50 hover:shadow-[0_0_24px_-4px_var(--color-accent)] transition-shadow"
                  >
                    <Send size={16} /> {tgSending ? "Отправляем..." : "Отправить код в Telegram"}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleVerifyCode} className="space-y-4">
                  <p className="text-xs text-white/40 text-center">
                    Код отправлен для <span className="text-white/70">{tgEmail}</span>
                  </p>
                  <input
                    autoFocus
                    required
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={tgCode}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/\D/g, "").slice(0, 6);
                      setTgCode(digits);
                      // Шесть цифр введено (или вставлено целиком из Telegram) — входим сразу, без лишнего клика
                      if (digits.length === 6) verifyCode(digits);
                    }}
                    placeholder="• • • • • •"
                    maxLength={6}
                    className="input-field text-center tracking-[0.4em] font-mono text-xl focus:ring-2 focus:ring-accent/30 transition-shadow"
                  />
                  <button disabled={tgVerifying || tgCode.length !== 6} className="btn-primary w-full py-3 disabled:opacity-50">
                    {tgVerifying ? "Проверяем..." : "Войти"}
                  </button>
                  <div className="flex items-center justify-between text-xs">
                    <button
                      type="button"
                      onClick={() => setCodeSent(false)}
                      className="text-white/40 hover:text-white/70 transition-colors"
                    >
                      Другой email
                    </button>
                    <button
                      type="button"
                      disabled={resendIn > 0 || tgSending}
                      onClick={requestCode}
                      className="flex items-center gap-1.5 text-accent disabled:text-white/25 hover:underline disabled:no-underline transition-colors"
                    >
                      <RotateCw size={12} className={tgSending ? "animate-spin" : ""} />
                      {resendIn > 0 ? `Отправить ещё раз (${resendIn} с)` : "Отправить ещё раз"}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}
          </div>

          <p className="text-center text-sm text-white/40 mt-6">
            Нет аккаунта?{" "}
            <Link href="/auth/register" className="text-accent hover:underline">
              Зарегистрироваться
            </Link>
          </p>
        </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="relative min-h-[calc(100vh-64px)] flex items-center justify-center px-4">
          <AuthBackground />
          <p className="text-white/40">Загрузка...</p>
        </div>
      }
    >
      <LoginInner />
    </Suspense>
  );
}
