"use client";

import { FormEvent, ReactNode, useEffect, useState } from "react";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/lib/firebase";
import { mApi } from "./api";
import { Spinner } from "./ui";
import { InstallSteps } from "./SettingsPane";

const HANDLE_RE = /^[a-z0-9_]{4,24}$/;

const authError = (code?: string) =>
  code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found"
    ? "Неверная почта или пароль"
    : code === "auth/too-many-requests"
    ? "Слишком много попыток, подожди немного"
    : "Не удалось войти";

function Shell({ title, subtitle, children, onBack }: { title: string; subtitle?: string; children: ReactNode; onBack?: () => void }) {
  return (
    <div className="h-full vc-scroll flex flex-col vc-safe-top vc-safe-bottom">
      <div className="h-12 px-3 flex items-center shrink-0">
        {onBack && (
          <button onClick={onBack} className="p-2 -ml-1" style={{ color: "var(--vc-accent)" }} aria-label="Назад">
            <ArrowLeft size={24} />
          </button>
        )}
      </div>
      <div className="flex-1 flex flex-col items-center justify-center px-6 pb-10 w-full max-w-[400px] mx-auto">
        <div className="vc-step w-full flex flex-col items-center text-center" key={title}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/vc/logo.png" alt="MiliGram" width={104} height={104} className="mb-5" style={{ filter: "drop-shadow(0 12px 28px rgba(255,120,40,0.35))" }} />
          <h1 className="text-[26px] font-bold mb-2">{title}</h1>
          {subtitle && <p className="vc-muted text-[15px] mb-6 max-w-[320px] leading-snug">{subtitle}</p>}
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

/** Нужен ли код доступа: GET gate → { open }. По умолчанию регистрация открыта. */
function useGate() {
  const [open, setOpen] = useState(true);
  useEffect(() => {
    mApi<{ open: boolean }>("gate").then((d) => setOpen(d.open)).catch(() => {});
  }, []);
  return open;
}

async function getGateToken(open: boolean, code: string): Promise<string | undefined> {
  if (open) return undefined;
  const d = await mApi<{ gateToken: string }>("gate", { code: code.trim() });
  return d.gateToken;
}

/** Экраны для тех, кто ещё не вошёл: приветствие → вход / регистрация. Дальше MessengerApp сам видит вход и открывает чаты. */
export function Onboarding() {
  const [mode, setMode] = useState<"welcome" | "login" | "register">("welcome");
  const open = useGate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const login = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (err: any) {
      setError(authError(err?.code));
      setBusy(false);
    }
  };

  const register = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    const h = handle.trim().replace(/^@/, "").toLowerCase();
    if (name.trim().length < 2) return setError("Введи имя (минимум 2 символа)");
    if (!HANDLE_RE.test(h)) return setError("@username: 4–24 символа, латиница, цифры и «_»");
    if (password.length < 8) return setError("Пароль — минимум 8 символов");
    setBusy(true);
    try {
      const gateToken = await getGateToken(open, code);
      await mApi("register", { gateToken, email: email.trim(), password, handle: h, displayName: name.trim() });
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (err: any) {
      setError(err?.message || "Не удалось создать аккаунт");
      setBusy(false);
    }
  };

  const err = error && <p className="text-[14px] px-1" style={{ color: "var(--vc-danger)" }}>{error}</p>;

  if (mode === "welcome") {
    return (
      <Shell title="MiliGram" subtitle="Быстрый и милый мессенджер Velox Trade.">
        <button className="vc-btn" onClick={() => setMode("register")}>Создать аккаунт</button>
        <button className="vc-btn" style={{ background: "var(--vc-surface)", color: "var(--vc-text)" }} onClick={() => setMode("login")}>У меня уже есть аккаунт</button>
        {isIos() && !isStandalone() && (
          <div className="vc-card"><div className="px-4 py-3"><p className="font-semibold mb-2">Совет для iPhone</p><InstallSteps /></div></div>
        )}
        <p className="text-[12px] vc-muted text-center pt-2">Сообщения не имеют сквозного шифрования: сервер технически может их читать.</p>
      </Shell>
    );
  }

  if (mode === "login") {
    return (
      <Shell title="Вход" subtitle="Почта и пароль от аккаунта MiliGram." onBack={() => { setMode("welcome"); setError(""); }}>
        <form onSubmit={login} className="space-y-3">
          <input className="vc-input" type="email" placeholder="Почта" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
          <input className="vc-input" type="password" placeholder="Пароль" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          {err}
          <button className="vc-btn" disabled={busy || !email || !password}>{busy ? "Вхожу…" : "Войти"}</button>
          <button type="button" className="vc-btn vc-btn-ghost" onClick={() => { setMode("register"); setError(""); }}>Создать аккаунт</button>
        </form>
      </Shell>
    );
  }

  return (
    <Shell title="Новый аккаунт" subtitle="Имя увидят собеседники, по @username тебя смогут найти." onBack={() => { setMode("welcome"); setError(""); }}>
      <form onSubmit={register} className="space-y-3">
        <input className="vc-input" placeholder="Имя" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 vc-muted">@</span>
          <input className="vc-input" style={{ paddingLeft: 34 }} placeholder="username" maxLength={24} autoCapitalize="none" autoCorrect="off" value={handle} onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_@]/g, ""))} />
        </div>
        <input className="vc-input" type="email" placeholder="Почта" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className="vc-input" type="password" placeholder="Пароль (от 8 символов)" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        {!open && <input className="vc-input" placeholder="Код доступа" autoComplete="off" value={code} onChange={(e) => setCode(e.target.value)} />}
        {err}
        <button className="vc-btn" disabled={busy || !name || !handle || !email || !password}>{busy ? "Создаю аккаунт…" : "Создать аккаунт"}</button>
      </form>
    </Shell>
  );
}

/** Человек уже вошёл на сайте Velox, но аккаунта MiliGram ещё нет — достаточно имени и @username. */
export function JoinScreen({ defaultName }: { defaultName: string }) {
  const open = useGate();
  const [name, setName] = useState(defaultName);
  const [handle, setHandle] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const join = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    const h = handle.trim().replace(/^@/, "").toLowerCase();
    if (name.trim().length < 2) return setError("Введи имя (минимум 2 символа)");
    if (!HANDLE_RE.test(h)) return setError("@username: 4–24 символа, латиница, цифры и «_»");
    setBusy(true);
    try {
      const gateToken = await getGateToken(open, code);
      await mApi("join", { gateToken, handle: h, displayName: name.trim() });
      // аккаунт появится в Firestore — MessengerApp подхватит его сам (onSnapshot)
    } catch (err: any) {
      setError(err?.message || "Не удалось создать аккаунт");
      setBusy(false);
    }
  };

  return (
    <Shell title="Ещё один шаг" subtitle="Выбери имя и @username для MiliGram.">
      <form onSubmit={join} className="space-y-3">
        <input className="vc-input" placeholder="Имя" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 vc-muted">@</span>
          <input className="vc-input" style={{ paddingLeft: 34 }} placeholder="username" maxLength={24} autoCapitalize="none" autoCorrect="off" value={handle} onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_@]/g, ""))} />
        </div>
        {!open && <input className="vc-input" placeholder="Код доступа" autoComplete="off" value={code} onChange={(e) => setCode(e.target.value)} />}
        {error && <p className="text-[14px] px-1" style={{ color: "var(--vc-danger)" }}>{error}</p>}
        <button className="vc-btn" disabled={busy || !name || !handle}>{busy ? "Создаю…" : "Продолжить"}</button>
        <button type="button" className="vc-btn vc-btn-ghost" style={{ color: "var(--vc-muted)" }} onClick={() => signOut(auth)}>Выйти из аккаунта</button>
      </form>
    </Shell>
  );
}

export function OnboardingLoading() {
  return <div className="h-full flex items-center justify-center"><Spinner size={28} /></div>;
}
