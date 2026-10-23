"use client";

import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Camera } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { auth } from "@/lib/firebase";
import { mApi, mApiPublic, mUpload } from "./api";
import { Avatar, Spinner } from "./ui";
import { InstallSteps } from "./SettingsPane";
import { readGateToken, saveGateToken } from "./MessengerEntry";
import { useMyAccount } from "./hooks";

type Step = "login" | "code" | "account" | "verify" | "profile" | "avatar" | "done";

const HANDLE_RE = /^[a-z][a-z0-9_]{4,31}$/;

function Shell({ title, subtitle, children, onBack }: { title: string; subtitle?: string; children: ReactNode; onBack?: () => void }) {
  return (
    <div className="h-full mx-scroll flex flex-col mx-safe-top mx-safe-bottom">
      <div className="h-12 px-3 flex items-center shrink-0">
        {onBack && (
          <button onClick={onBack} className="p-2 -ml-1" style={{ color: "var(--mx-accent)" }} aria-label="Назад">
            <ArrowLeft size={24} />
          </button>
        )}
      </div>
      <div className="flex-1 flex flex-col items-center justify-center px-6 pb-10 w-full max-w-[400px] mx-auto">
        <div className="mx-step w-full flex flex-col items-center text-center" key={title}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/m/icon-192.png" alt="" width={96} height={96} className="rounded-[26px] mb-5" style={{ boxShadow: "0 10px 40px -10px var(--mx-accent)" }} />
          <h1 className="text-[26px] font-bold mb-2">{title}</h1>
          {subtitle && <p className="mx-muted text-[15px] mb-6 max-w-[320px] leading-snug">{subtitle}</p>}
          <div className="w-full space-y-3 text-left">{children}</div>
        </div>
      </div>
    </div>
  );
}

function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}
function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (window.navigator as any).standalone === true || window.matchMedia("(display-mode: standalone)").matches;
}

/** Регистрация и вход как в Telegram: логотип по центру, одно главное действие на экране, плавная смена шагов. */
export function Onboarding() {
  const router = useRouter();
  const sp = useSearchParams();
  const { user, loading: authLoading, login } = useAuth();
  const { account, loading: accLoading } = useMyAccount(user?.uid);

  const [step, setStep] = useState<Step | null>(null);
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [verifyCode, setVerifyCode] = useState("");
  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // выбор стартового шага, когда известно состояние входа
  useEffect(() => {
    if (step !== null || authLoading) return;
    if (user && accLoading) return;
    if (user && account) {
      router.replace("/m");
      return;
    }
    const want = sp.get("step") as Step | null;
    const hasGate = !!readGateToken();
    if (sp.get("mode") === "login") setStep("login");
    else if (want === "account" && hasGate && !user) setStep("account");
    else if (want === "profile" && hasGate && user) setStep("profile");
    else if (user && hasGate) setStep("profile");
    else setStep("code");
  }, [step, authLoading, user, accLoading, account, sp, router]);

  const go = (s: Step) => {
    setError("");
    setBusy(false);
    setStep(s);
  };

  const gateOrBack = (): string | null => {
    const t = readGateToken();
    if (!t) {
      setError("Код доступа устарел. Введи его ещё раз.");
      setStep("code");
    }
    return t;
  };

  const submitCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await mApiPublic<{ gateToken: string }>("gate", { code: code.trim() });
      saveGateToken(res.gateToken);
      go(user ? "profile" : "account");
    } catch (err: any) {
      setError(err?.message || "Неверный код доступа");
      setBusy(false);
    }
  };

  const submitAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError("Проверь адрес почты");
    if (password.length < 8) return setError("Пароль — минимум 8 символов");
    if (password !== password2) return setError("Пароли не совпадают");
    setBusy(true);
    try {
      const res = await fetch("/api/auth/email-code/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: email.trim().toLowerCase() }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Не удалось отправить код на почту");
      go("verify");
    } catch (err: any) {
      setError(err?.message || "Не удалось отправить код");
      setBusy(false);
    }
  };

  const submitVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/email-code/confirm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: email.trim().toLowerCase(), code: verifyCode.trim() }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Неверный код");
      go("profile");
    } catch (err: any) {
      setError(err?.message || "Неверный код");
      setBusy(false);
    }
  };

  const submitProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const h = handle.trim().replace(/^@/, "").toLowerCase();
    if (name.trim().length < 2) return setError("Введи имя (минимум 2 символа)");
    if (!HANDLE_RE.test(h)) return setError("Имя пользователя: 5–32 символа, латиница, цифры и _, начинается с буквы");
    const gateToken = gateOrBack();
    if (!gateToken) return;
    setBusy(true);
    try {
      if (user) {
        await mApi("join", { gateToken, handle: h, displayName: name.trim() });
      } else {
        await mApiPublic("register", { gateToken, email: email.trim().toLowerCase(), password, handle: h, displayName: name.trim() });
        await login(email.trim().toLowerCase(), password);
      }
      go("avatar");
    } catch (err: any) {
      setError(err?.message || "Не удалось создать аккаунт");
      setBusy(false);
    }
  };

  const pickPhoto = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    try {
      const url = URL.createObjectURL(f);
      const img = await new Promise<HTMLImageElement>((res, rej) => {
        const i = new Image();
        i.onload = () => res(i);
        i.onerror = rej;
        i.src = url;
      });
      const side = Math.min(img.naturalWidth, img.naturalHeight);
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = Math.min(512, side);
      canvas.getContext("2d")!.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      const blob: Blob = await new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("blob"))), "image/jpeg", 0.88));
      const up = await mUpload(blob, "avatar", { fileName: "avatar.jpg" });
      await mApi("profile", { photoURL: up.url });
      setPhoto(up.url);
    } catch (err: any) {
      setError(err?.message || "Не удалось загрузить фото");
    } finally {
      setBusy(false);
    }
  };

  const submitLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await login(email.trim().toLowerCase(), password);
      router.replace("/m");
    } catch (err: any) {
      setError(err?.message?.includes("auth/") ? "Неверная почта или пароль" : err?.message || "Не удалось войти");
      setBusy(false);
    }
  };

  const pwdOk = useMemo(() => password.length >= 8, [password]);
  void pwdOk;

  if (step === null) {
    return <div className="h-full flex items-center justify-center"><Spinner size={28} /></div>;
  }

  const err = error && <p className="text-[14px] px-1" style={{ color: "var(--mx-danger)" }}>{error}</p>;

  if (step === "login") {
    return (
      <Shell title="Вход" subtitle="Войди в Velox Chat по почте и паролю." onBack={() => router.replace("/")}>
        <form onSubmit={submitLogin} className="space-y-3">
          <input className="mx-input" type="email" placeholder="Почта" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
          <input className="mx-input" type="password" placeholder="Пароль" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          {err}
          <button className="mx-btn" disabled={busy || !email || !password}>{busy ? "Вхожу…" : "Войти"}</button>
          <button type="button" className="mx-btn mx-btn-ghost" onClick={() => go("code")}>Создать аккаунт</button>
        </form>
      </Shell>
    );
  }

  if (step === "code") {
    return (
      <Shell title="Velox Chat" subtitle="Закрытый мессенджер. Чтобы создать аккаунт, введи код доступа." onBack={() => router.replace("/")}>
        <form onSubmit={submitCode} className="space-y-3">
          <input className="mx-input" type="password" placeholder="Код доступа" autoComplete="off" value={code} onChange={(e) => setCode(e.target.value)} autoFocus />
          {err}
          <button className="mx-btn" disabled={busy || !code.trim()}>{busy ? "Проверяю…" : "Продолжить"}</button>
          <button type="button" className="mx-btn mx-btn-ghost" onClick={() => go("login")}>У меня уже есть аккаунт</button>
        </form>
      </Shell>
    );
  }

  if (step === "account") {
    return (
      <Shell title="Твой аккаунт" subtitle="Укажи почту и придумай пароль. На почту придёт код подтверждения." onBack={() => go("code")}>
        <form onSubmit={submitAccount} className="space-y-3">
          <input className="mx-input" type="email" placeholder="Почта" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
          <input className="mx-input" type="password" placeholder="Пароль (минимум 8 символов)" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <input className="mx-input" type="password" placeholder="Повтори пароль" autoComplete="new-password" value={password2} onChange={(e) => setPassword2(e.target.value)} />
          {err}
          <button className="mx-btn" disabled={busy || !email || !password}>{busy ? "Отправляю код…" : "Продолжить"}</button>
        </form>
      </Shell>
    );
  }

  if (step === "verify") {
    return (
      <Shell title="Код из письма" subtitle={`Мы отправили 6-значный код на ${email}. Проверь и папку «Спам».`} onBack={() => go("account")}>
        <form onSubmit={submitVerify} className="space-y-3">
          <input className="mx-input" style={{ textAlign: "center", letterSpacing: "0.4em", fontSize: 24 }} inputMode="numeric" maxLength={6} placeholder="······" autoComplete="one-time-code" value={verifyCode} onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, ""))} autoFocus />
          {err}
          <button className="mx-btn" disabled={busy || verifyCode.length !== 6}>{busy ? "Проверяю…" : "Подтвердить"}</button>
          <button type="button" className="mx-btn mx-btn-ghost" onClick={submitAccount as any}>Отправить код ещё раз</button>
        </form>
      </Shell>
    );
  }

  if (step === "profile") {
    return (
      <Shell title="Как тебя зовут?" subtitle="Имя увидят собеседники. По @username тебя смогут найти." onBack={user ? undefined : () => go("verify")}>
        <form onSubmit={submitProfile} className="space-y-3">
          <input className="mx-input" placeholder="Имя" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 mx-muted text-[16px]">@</span>
            <input className="mx-input" style={{ paddingLeft: 34 }} placeholder="username" maxLength={32} autoCapitalize="none" autoCorrect="off" value={handle} onChange={(e) => setHandle(e.target.value.replace(/[^a-zA-Z0-9_]/g, ""))} />
          </div>
          <p className="mx-muted text-[13px] px-1">5–32 символа: латиница, цифры и «_».</p>
          {err}
          <button className="mx-btn" disabled={busy || !name.trim() || !handle}>{busy ? "Создаю аккаунт…" : "Создать аккаунт"}</button>
        </form>
      </Shell>
    );
  }

  if (step === "avatar") {
    return (
      <Shell title="Добавь фото" subtitle="Так тебя будут узнавать. Можно пропустить и сделать это позже.">
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { pickPhoto(e.target.files?.[0]); e.target.value = ""; }} />
        <div className="flex justify-center py-2">
          <button onClick={() => fileRef.current?.click()} disabled={busy} className="relative">
            <Avatar src={photo} name={name || "?"} size={120} />
            <span className="absolute bottom-1 right-1 w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "var(--mx-accent)", color: "var(--mx-accent-text)", border: "3px solid var(--mx-bg)" }}>
              {busy ? <Spinner size={16} /> : <Camera size={18} />}
            </span>
          </button>
        </div>
        {err}
        <button className="mx-btn" onClick={() => go("done")} disabled={busy}>{photo ? "Продолжить" : "Пропустить"}</button>
      </Shell>
    );
  }

  return (
    <Shell title="Готово!" subtitle="Аккаунт создан. Добро пожаловать в Velox Chat.">
      {isIos() && !isStandalone() && (
        <div className="mx-card"><div className="px-4 py-3"><p className="font-semibold mb-2">Совет для iPhone</p><InstallSteps /></div></div>
      )}
      <button className="mx-btn" onClick={() => router.replace("/m")}>Открыть чаты</button>
    </Shell>
  );
}

void auth;
