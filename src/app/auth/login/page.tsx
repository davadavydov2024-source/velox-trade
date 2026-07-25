"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Mail, Lock, Send, MessageCircle } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { useToast } from "@/lib/toastContext";
import { getFeatureFlags } from "@/lib/featureFlags";
import { DEFAULT_FEATURE_FLAGS, FeatureFlags } from "@/types";

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

export default function LoginPage() {
  const { login, loginWithGoogle, loginWithCustomToken } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const [mode, setMode] = useState<"password" | "telegram">("password");
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
      router.push("/profile");
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
      router.push("/profile");
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
      router.push("/profile");
    } catch {
      toast("error", "Не удалось войти. Попробуй ещё раз.");
    } finally {
      setTgVerifying(false);
    }
  }

  return (
    <div className="max-w-md mx-auto px-4 py-16">
      <div className="card p-8">
        <h1 className="text-2xl font-bold mb-1">Вход в аккаунт</h1>
        <p className="text-white/40 text-sm mb-6">Рады видеть тебя снова в Velox Trade</p>

        {flags.telegramLoginEnabled && (
          <div className="flex gap-2 mb-6">
            <button
              onClick={() => setMode("password")}
              className={`flex-1 py-2 rounded-btn text-sm font-medium transition-colors ${
                mode === "password" ? "bg-accent text-black" : "bg-surface text-white/60"
              }`}
            >
              Пароль
            </button>
            <button
              onClick={() => setMode("telegram")}
              className={`flex-1 py-2 rounded-btn text-sm font-medium flex items-center justify-center gap-1.5 transition-colors ${
                mode === "telegram" ? "bg-accent text-black" : "bg-surface text-white/60"
              }`}
            >
              <MessageCircle size={14} /> Код в Telegram
            </button>
          </div>
        )}

        {mode === "password" ? (
          <>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" size={18} />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email"
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
                  placeholder="Пароль"
                  className="input-field pl-10"
                />
              </div>
              <div className="text-right">
                <Link href="/auth/reset" className="text-xs text-accent hover:underline">
                  Забыли пароль?
                </Link>
              </div>
              <button disabled={loading} className="btn-primary w-full py-3 disabled:opacity-50">
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

                <button onClick={handleGoogle} className="btn-secondary w-full py-3">
                  Войти через Google
                </button>
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
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" size={18} />
                  <input
                    type="email"
                    required
                    value={tgEmail}
                    onChange={(e) => setTgEmail(e.target.value)}
                    placeholder="Email аккаунта"
                    className="input-field pl-10"
                  />
                </div>
                <button disabled={tgSending} className="btn-primary w-full py-3 flex items-center justify-center gap-2 disabled:opacity-50">
                  <Send size={16} /> {tgSending ? "Отправляем..." : "Отправить код в Telegram"}
                </button>
              </form>
            ) : (
              <form onSubmit={handleVerifyCode} className="space-y-4">
                <input
                  required
                  value={tgCode}
                  onChange={(e) => setTgCode(e.target.value)}
                  placeholder="Код из Telegram (6 цифр)"
                  maxLength={6}
                  className="input-field text-center tracking-[0.3em] font-mono text-lg"
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

        <p className="text-center text-sm text-white/40 mt-6">
          Нет аккаунта?{" "}
          <Link href="/auth/register" className="text-accent hover:underline">
            Зарегистрироваться
          </Link>
        </p>
      </div>
    </div>
  );
}
