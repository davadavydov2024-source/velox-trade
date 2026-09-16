"use client";

import { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Mail, Lock, Send, MessageCircle, QrCode, Sparkles } from "lucide-react";
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
  const [loading, setLoading] = useState(false);

  // --- вход по коду из Telegram ---
  const [tgEmail, setTgEmail] = useState("");
  const [tgCode, setTgCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [tgSending, setTgSending] = useState(false);
  const [tgVerifying, setTgVerifying] = useState(false);

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

  async function handleRequestCode(e: React.FormEvent) {
    e.preventDefault();
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
      toast("success", "Код отправлен в Telegram. Проверь бота.");
    } catch {
      toast("error", "Не удалось связаться с сервером. Проверь подключение к интернету.");
    } finally {
      setTgSending(false);
    }
  }

  async function handleVerifyCode(e: React.FormEvent) {
    e.preventDefault();
    setTgVerifying(true);
    try {
      const res = await fetch("/api/auth/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: tgEmail, code: tgCode }),
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
                    type="password"
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Пароль"
                    className="input-field pl-10 focus:ring-2 focus:ring-accent/30 transition-shadow"
                  />
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
                    <button onClick={handleGoogle} className="btn-secondary w-full py-3">
                      Войти через Google
                    </button>
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="space-y-4">
              <p className="text-xs text-white/40">
                Работает только если Telegram уже привязан к аккаунту (Профиль → Безопасность на устройстве, где ты уже
                вошёл).
              </p>
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
                  <input
                    required
                    autoComplete="one-time-code"
                    value={tgCode}
                    onChange={(e) => setTgCode(e.target.value)}
                    placeholder="Код из Telegram (6 цифр)"
                    maxLength={6}
                    className="input-field text-center tracking-[0.3em] font-mono text-lg focus:ring-2 focus:ring-accent/30 transition-shadow"
                  />
                  <button disabled={tgVerifying} className="btn-primary w-full py-3 disabled:opacity-50">
                    {tgVerifying ? "Проверяем..." : "Войти"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setCodeSent(false)}
                    className="text-xs text-white/40 hover:text-white/70 w-full text-center"
                  >
                    Ввести другой email
                  </button>
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
