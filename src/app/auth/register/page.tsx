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

export default function RegisterPage() {
  const { register } = useAuth();
  const { toast } = useToast();
  const router = useRouter();

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
      await register(email, password, name);
      toast("success", "Аккаунт создан! Письмо для подтверждения email отправлено.");
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
      <div className="max-w-md mx-auto px-4 py-16">
        <div className="card p-8 text-center">
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
    <div className="max-w-md mx-auto px-4 py-16">
      <div className="card p-8">
        <h1 className="text-2xl font-bold mb-1">Регистрация</h1>
        <p className="text-white/40 text-sm mb-6">Создай аккаунт и начни покупать предметы</p>

        {flags.telegramRegisterEnabled && (
          <div className="flex gap-2 mb-6">
            <button
              onClick={() => setMode("password")}
              className={`flex-1 py-2 rounded-btn text-sm font-medium transition-colors ${
                mode === "password" ? "bg-accent text-black" : "bg-surface text-white/60"
              }`}
            >
              Email и пароль
            </button>
            <button
              onClick={() => setMode("telegram")}
              className={`flex-1 py-2 rounded-btn text-sm font-medium flex items-center justify-center gap-1.5 transition-colors ${
                mode === "telegram" ? "bg-accent text-black" : "bg-surface text-white/60"
              }`}
            >
              <MessageCircle size={14} /> Через Telegram
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
                placeholder="Имя пользователя"
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
                placeholder="Пароль (мин. 6 символов)"
                className="input-field pl-10"
              />
            </div>
            <button disabled={loading} className="btn-primary w-full py-3 disabled:opacity-50">
              {loading ? "Создаём аккаунт..." : "Зарегистрироваться"}
            </button>
          </form>
        ) : tgConfirmed ? (
          <div className="text-center py-4 space-y-4">
            <CheckCircle2 className="mx-auto text-green-400" size={36} />
            <p className="text-sm text-white/70">
              Аккаунт создан! Код для входа уже отправлен тебе в Telegram — введи его на странице входа.
            </p>
            <Link href="/auth/login" className="btn-primary inline-block px-6 py-3 text-sm">
              Перейти ко входу
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
          <form onSubmit={handleStartTelegramRegister} className="space-y-4">
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" size={18} />
              <input
                required
                value={tgName}
                onChange={(e) => setTgName(e.target.value)}
                placeholder="Имя пользователя"
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
                placeholder="Email"
                className="input-field pl-10"
              />
            </div>
            <button disabled={tgCreating} className="btn-primary w-full py-3 disabled:opacity-50">
              {tgCreating ? "Готовим ссылку..." : "Продолжить в Telegram"}
            </button>
            <p className="text-xs text-white/30 text-center">Без пароля — вход будет по коду из Telegram.</p>
          </form>
        )}

        <p className="text-center text-sm text-white/40 mt-6">
          Уже есть аккаунт?{" "}
          <Link href="/auth/login" className="text-accent hover:underline">
            Войти
          </Link>
        </p>
      </div>
    </div>
  );
}
