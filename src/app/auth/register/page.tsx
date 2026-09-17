"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Mail, Lock, User, ExternalLink, MessageCircle, CheckCircle2, Sparkles, ChevronLeft, KeyRound, CalendarDays, MailCheck } from "lucide-react";
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
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

// Шаги мастера регистрации — каждый рисуется как отдельная "страница" внутри карточки, со
// слайд-анимацией между ними (см. .auth-step-forward/.auth-step-back в globals.css).
// 0 — язык + способ регистрации; 1..4 — только для способа "пароль" (имя → email → возраст →
// пароль); путь "телеграм" со своего step 1 показывает одну форму (имя+email+возраст) и дальше сам
// управляет внутренними состояниями (ссылка на бота / ожидание / подтверждено).
type Step = 0 | 1 | 2 | 3 | 4 | 5;
const MIN_AGE = 6;
const MAX_AGE = 120;

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
  const [step, setStep] = useState<Step>(0);
  const [dir, setDir] = useState<1 | -1>(1);

  useEffect(() => {
    getFeatureFlags().then((f) => {
      setFlags(f);
      setFlagsLoaded(true);
      if (!f.telegramRegisterEnabled) setMode("password");
    });
  }, []);

  function goNext() {
    setDir(1);
    setStep((s) => Math.min(5, s + 1) as Step);
  }
  function goBack() {
    setDir(-1);
    setStep((s) => Math.max(0, s - 1) as Step);
  }

  // --- регистрация по паролю ---
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [age, setAge] = useState("");
  const [password, setPassword] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);

  // --- регистрация через Telegram ---
  const [tgName, setTgName] = useState("");
  const [tgEmail, setTgEmail] = useState("");
  const [tgAge, setTgAge] = useState("");
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

  function handleNameNext(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast("warning", "Введи имя");
      return;
    }
    goNext();
  }

  function handleEmailNext(e: React.FormEvent) {
    e.preventDefault();
    if (!EMAIL_RE.test(email.trim())) {
      toast("warning", "Введи корректный email");
      return;
    }
    goNext();
    sendEmailCode(email.trim());
  }

  const [emailCode, setEmailCode] = useState("");
  const [emailCodeSending, setEmailCodeSending] = useState(false);
  const [emailCodeChecking, setEmailCodeChecking] = useState(false);
  const [emailVerified, setEmailVerified] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setInterval(() => setResendCooldown((v) => Math.max(0, v - 1)), 1000);
    return () => clearInterval(t);
  }, [resendCooldown]);

  async function sendEmailCode(targetEmail: string) {
    setEmailCodeSending(true);
    try {
      const res = await fetch("/api/auth/email-code/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: targetEmail }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResendCooldown(30);
    } catch (err: any) {
      toast("error", err.message || "Не удалось отправить код");
    } finally {
      setEmailCodeSending(false);
    }
  }

  async function handleEmailCodeNext(e: React.FormEvent) {
    e.preventDefault();
    setEmailCodeChecking(true);
    try {
      const res = await fetch("/api/auth/email-code/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), code: emailCode.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setEmailVerified(true);
      goNext();
    } catch (err: any) {
      toast("error", err.message || "Не удалось проверить код");
    } finally {
      setEmailCodeChecking(false);
    }
  }

  function handleAgeNext(e: React.FormEvent) {
    e.preventDefault();
    const value = Number(age);
    if (!Number.isInteger(value) || value < MIN_AGE || value > MAX_AGE) {
      toast("warning", `Укажи реальный возраст (от ${MIN_AGE} до ${MAX_AGE})`);
      return;
    }
    goNext();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) {
      toast("warning", "Пароль должен быть не короче 6 символов");
      return;
    }
    setLoading(true);
    try {
      await register(email, password, name, language, Number(age));

      // Почта уже подтверждена кодом на предыдущем шаге — переносим этот факт на только что
      // созданный Firebase Auth аккаунт через Admin SDK (см. /api/auth/email-code/finalize).
      // Не критично для успеха регистрации, если вдруг не сработает — просто аккаунт останется
      // с emailVerified:false, как было бы и со старым письмом-ссылкой, если бы его не открыли.
      try {
        const idToken = await auth.currentUser?.getIdToken();
        if (idToken) {
          await fetch("/api/auth/email-code/finalize", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
          });
        }
      } catch {
        // см. комментарий выше
      }

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
      toast("success", "Аккаунт создан и почта подтверждена!");
      celebrate("register");
      router.push("/profile");
    } catch (err: any) {
      toast("error", translateAuthError(err?.code));
    } finally {
      setLoading(false);
    }
  }

  const [tgPhase, setTgPhase] = useState<"form" | "code">("form");
  const [tgEmailCode, setTgEmailCode] = useState("");
  const [tgCodeSending, setTgCodeSending] = useState(false);
  const [tgCodeChecking, setTgCodeChecking] = useState(false);
  const [tgResendCooldown, setTgResendCooldown] = useState(0);

  useEffect(() => {
    if (tgResendCooldown <= 0) return;
    const t = setInterval(() => setTgResendCooldown((v) => Math.max(0, v - 1)), 1000);
    return () => clearInterval(t);
  }, [tgResendCooldown]);

  async function sendTgEmailCode() {
    setTgCodeSending(true);
    try {
      const res = await fetch("/api/auth/email-code/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: tgEmail }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setTgResendCooldown(30);
    } catch (err: any) {
      toast("error", err.message || "Не удалось отправить код");
    } finally {
      setTgCodeSending(false);
    }
  }

  function handleTgDetailsNext(e: React.FormEvent) {
    e.preventDefault();
    const ageValue = Number(tgAge);
    if (!Number.isInteger(ageValue) || ageValue < MIN_AGE || ageValue > MAX_AGE) {
      toast("warning", `Укажи реальный возраст (от ${MIN_AGE} до ${MAX_AGE})`);
      return;
    }
    setTgPhase("code");
    sendTgEmailCode();
  }

  async function handleTgCodeNext(e: React.FormEvent) {
    e.preventDefault();
    setTgCodeChecking(true);
    try {
      const res = await fetch("/api/auth/email-code/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: tgEmail.trim(), code: tgEmailCode.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await handleStartTelegramRegister();
    } catch (err: any) {
      toast("error", err.message || "Не удалось проверить код");
    } finally {
      setTgCodeChecking(false);
    }
  }

  async function handleStartTelegramRegister(e?: React.FormEvent) {
    e?.preventDefault();
    const ageValue = Number(tgAge);
    if (!Number.isInteger(ageValue) || ageValue < MIN_AGE || ageValue > MAX_AGE) {
      toast("warning", `Укажи реальный возраст (от ${MIN_AGE} до ${MAX_AGE})`);
      return;
    }
    setTgCreating(true);
    try {
      const code = await createTelegramRegisterRequest(tgEmail, tgName, ageValue);
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
    return (
      <div className="relative min-h-[calc(100vh-64px)] flex items-center justify-center px-4">
        <AuthBackground />
        <p className="text-white/40">Загрузка...</p>
      </div>
    );
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

  const usesSteps = mode === "password" && flags.registrationEnabled;
  const totalSteps = 6; // 0..5 — только для пути "пароль"; для телеграма степпер не показываем
  const animClass = dir === 1 ? "auth-step-forward" : "auth-step-back";

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

          <div className="flex items-center gap-3 mb-1">
            {step > 0 && (
              <button
                type="button"
                onClick={goBack}
                className="shrink-0 w-7 h-7 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white transition-colors"
              >
                <ChevronLeft size={16} />
              </button>
            )}
            <Sparkles size={20} className="text-accent shrink-0" />
            <h1
              className="text-2xl font-bold auth-title-sheen bg-clip-text text-transparent"
              style={{ backgroundImage: "linear-gradient(90deg, #fff, var(--color-accent-light), #fff)" }}
            >
              {t("auth_register_title")}
            </h1>
          </div>
          <p className="text-white/40 text-sm mb-5">{t("auth_register_subtitle")}</p>

          {/* Степпер — виден только на пути "пароль", у телеграм-пути своя внутренняя логика статусов */}
          {usesSteps && (
            <div className="flex items-center gap-1.5 mb-6">
              {Array.from({ length: totalSteps }).map((_, i) => (
                <div key={i} className={`h-1 flex-1 rounded-full transition-colors duration-300 ${i <= step ? "bg-accent" : "bg-white/10"}`} />
              ))}
            </div>
          )}

          <div key={`${mode}-${step}`} className={animClass}>
            {step === 0 && (
              <div className="space-y-6">
                <div>
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
                  <div>
                    <p className="text-xs text-white/40 mb-2">Способ регистрации</p>
                    <div className="relative flex bg-surface rounded-btn p-1">
                      <div
                        className="absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-btn bg-accent transition-transform duration-300 ease-out"
                        style={{ transform: mode === "password" ? "translateX(0)" : "translateX(calc(100% + 8px))" }}
                      />
                      <button
                        type="button"
                        onClick={() => setMode("password")}
                        className={`relative z-10 flex-1 py-2 rounded-btn text-sm font-medium transition-colors duration-200 ${
                          mode === "password" ? "text-black" : "text-white/60"
                        }`}
                      >
                        Email и пароль
                      </button>
                      <button
                        type="button"
                        onClick={() => setMode("telegram")}
                        className={`relative z-10 flex-1 py-2 rounded-btn text-sm font-medium flex items-center justify-center gap-1.5 transition-colors duration-200 ${
                          mode === "telegram" ? "text-black" : "text-white/60"
                        }`}
                      >
                        <MessageCircle size={14} /> Через Telegram
                      </button>
                    </div>
                  </div>
                )}

                <button type="button" onClick={goNext} className="btn-primary w-full py-3 hover:shadow-[0_0_24px_-4px_var(--color-accent)] transition-shadow">
                  Продолжить
                </button>
              </div>
            )}

            {step === 1 && mode === "password" && (
              <form onSubmit={handleNameNext} className="space-y-4">
                <div className="text-center mb-2">
                  <User size={28} className="mx-auto text-accent mb-2" />
                  <p className="text-sm text-white/50">Как тебя зовут?</p>
                </div>
                <div className="relative group">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 group-focus-within:text-accent transition-colors" size={18} />
                  <input
                    autoFocus
                    required
                    autoComplete="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t("auth_name_placeholder")}
                    className="input-field pl-10 focus:ring-2 focus:ring-accent/30 transition-shadow"
                  />
                </div>
                <button className="btn-primary w-full py-3 hover:shadow-[0_0_24px_-4px_var(--color-accent)] transition-shadow">Далее</button>
              </form>
            )}

            {step === 2 && mode === "password" && (
              <form onSubmit={handleEmailNext} className="space-y-4">
                <div className="text-center mb-2">
                  <Mail size={28} className="mx-auto text-accent mb-2" />
                  <p className="text-sm text-white/50">Приятно познакомиться, {name || "друг"}! Твой email?</p>
                </div>
                <div className="relative group">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 group-focus-within:text-accent transition-colors" size={18} />
                  <input
                    autoFocus
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t("auth_email_placeholder")}
                    className="input-field pl-10 focus:ring-2 focus:ring-accent/30 transition-shadow"
                  />
                </div>
                <button className="btn-primary w-full py-3 hover:shadow-[0_0_24px_-4px_var(--color-accent)] transition-shadow">Далее</button>
              </form>
            )}

            {step === 3 && mode === "password" && (
              <form onSubmit={handleEmailCodeNext} className="space-y-4">
                <div className="text-center mb-2">
                  <MailCheck size={28} className="mx-auto text-accent mb-2" />
                  <p className="text-sm text-white/50">
                    Мы отправили код на <span className="text-white/80">{email}</span>
                  </p>
                </div>
                <input
                  autoFocus
                  required
                  autoComplete="one-time-code"
                  value={emailCode}
                  onChange={(e) => setEmailCode(e.target.value)}
                  placeholder="Код из письма"
                  maxLength={6}
                  className="input-field text-center tracking-[0.3em] font-mono text-lg focus:ring-2 focus:ring-accent/30 transition-shadow"
                />
                <button
                  disabled={emailCodeChecking}
                  className="btn-primary w-full py-3 disabled:opacity-50 hover:shadow-[0_0_24px_-4px_var(--color-accent)] transition-shadow"
                >
                  {emailCodeChecking ? "Проверяем..." : "Подтвердить"}
                </button>
                <button
                  type="button"
                  onClick={() => sendEmailCode(email.trim())}
                  disabled={emailCodeSending || resendCooldown > 0}
                  className="text-xs text-white/40 hover:text-white/70 w-full text-center disabled:opacity-40"
                >
                  {resendCooldown > 0 ? `Отправить код ещё раз (${resendCooldown}с)` : emailCodeSending ? "Отправляем..." : "Отправить код ещё раз"}
                </button>
              </form>
            )}

            {step === 4 && mode === "password" && (
              <form onSubmit={handleAgeNext} className="space-y-4">
                <div className="text-center mb-2">
                  <CalendarDays size={28} className="mx-auto text-accent mb-2" />
                  <p className="text-sm text-white/50">Сколько тебе лет?</p>
                </div>
                <input
                  autoFocus
                  required
                  type="number"
                  min={MIN_AGE}
                  max={MAX_AGE}
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  placeholder="Возраст"
                  className="input-field text-center focus:ring-2 focus:ring-accent/30 transition-shadow"
                />
                <p className="text-xs text-white/25 text-center">Видно только администрации, нигде на сайте не показывается.</p>
                <button className="btn-primary w-full py-3 hover:shadow-[0_0_24px_-4px_var(--color-accent)] transition-shadow">Далее</button>
              </form>
            )}

            {step === 5 && mode === "password" && (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="text-center mb-2">
                  <KeyRound size={28} className="mx-auto text-accent mb-2" />
                  <p className="text-sm text-white/50">Последний шаг — придумай пароль</p>
                </div>
                <div className="relative group">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 group-focus-within:text-accent transition-colors" size={18} />
                  <input
                    autoFocus
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
            )}

            {step >= 1 && mode === "telegram" && (
              <>
                {tgConfirmed ? (
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
                      Нажми «Start» в боте — аккаунт создастся автоматически, и мы пришлём код для входа прямо туда.
                      Эта страница обновится сама.
                    </p>
                    <div className="flex items-center justify-center gap-2 text-xs text-white/30 pt-2">
                      <span className="w-2 h-2 rounded-full bg-accent animate-pulse" /> Ждём подтверждения...
                    </div>
                  </div>
                ) : tgPhase === "code" ? (
                  <form onSubmit={handleTgCodeNext} className="space-y-4">
                    <div className="text-center mb-2">
                      <MailCheck size={28} className="mx-auto text-accent mb-2" />
                      <p className="text-sm text-white/50">
                        Мы отправили код на <span className="text-white/80">{tgEmail}</span>
                      </p>
                    </div>
                    <input
                      autoFocus
                      required
                      autoComplete="one-time-code"
                      value={tgEmailCode}
                      onChange={(e) => setTgEmailCode(e.target.value)}
                      placeholder="Код из письма"
                      maxLength={6}
                      className="input-field text-center tracking-[0.3em] font-mono text-lg focus:ring-2 focus:ring-accent/30 transition-shadow"
                    />
                    <button
                      disabled={tgCodeChecking || tgCreating}
                      className="btn-primary w-full py-3 disabled:opacity-50 hover:shadow-[0_0_24px_-4px_var(--color-accent)] transition-shadow"
                    >
                      {tgCodeChecking || tgCreating ? "Проверяем..." : "Подтвердить"}
                    </button>
                    <button
                      type="button"
                      onClick={sendTgEmailCode}
                      disabled={tgCodeSending || tgResendCooldown > 0}
                      className="text-xs text-white/40 hover:text-white/70 w-full text-center disabled:opacity-40"
                    >
                      {tgResendCooldown > 0 ? `Отправить код ещё раз (${tgResendCooldown}с)` : tgCodeSending ? "Отправляем..." : "Отправить код ещё раз"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setTgPhase("form")}
                      className="text-xs text-white/30 hover:text-white/60 w-full text-center"
                    >
                      ← Изменить данные
                    </button>
                  </form>
                ) : (
                  <form onSubmit={handleTgDetailsNext} className="space-y-4">
                    <div className="relative group">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 group-focus-within:text-accent transition-colors" size={18} />
                      <input
                        autoFocus
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
                    <div className="relative group">
                      <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 group-focus-within:text-accent transition-colors" size={18} />
                      <input
                        type="number"
                        required
                        min={MIN_AGE}
                        max={MAX_AGE}
                        value={tgAge}
                        onChange={(e) => setTgAge(e.target.value)}
                        placeholder="Возраст"
                        className="input-field pl-10 focus:ring-2 focus:ring-accent/30 transition-shadow"
                      />
                    </div>
                    <button
                      disabled={tgCodeSending}
                      className="btn-primary w-full py-3 disabled:opacity-50 hover:shadow-[0_0_24px_-4px_var(--color-accent)] transition-shadow"
                    >
                      {tgCodeSending ? "Отправляем код..." : "Далее"}
                    </button>
                    <p className="text-xs text-white/30 text-center">Без пароля — вход будет по коду из Telegram.</p>
                  </form>
                )}
              </>
            )}
          </div>

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
