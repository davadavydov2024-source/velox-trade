"use client";

import { FormEvent, useEffect, useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { Loader2 } from "lucide-react";
import { auth } from "@/lib/firebase";
import { mApi } from "@/lib/messenger/client";

const authError = (code?: string) =>
  code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found" ? "Неверная почта или пароль"
  : code === "auth/too-many-requests" ? "Слишком много попыток, подожди немного" : "Не удалось войти";

function Logo() {
  return (
    <div className="text-center mb-6">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/miligram/icon-512.png" alt="MiliGram" className="w-28 h-28 mx-auto rounded-[28px] shadow-glow" />
      <h1 className="text-3xl font-bold mt-4">MiliGram</h1>
      <p className="text-white/50 text-sm mt-1">Быстрый и милый мессенджер Velox Trade</p>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-full overflow-y-auto">
      <div className="min-h-full flex items-center justify-center px-5 py-8">
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </div>
  );
}

/** Нужен ли код доступа: по умолчанию НЕТ (регистрация открыта). */
function useGate() {
  const [open, setOpen] = useState(true);
  useEffect(() => { mApi<{ open: boolean }>("gate").then((d) => setOpen(d.open)).catch(() => {}); }, []);
  return open;
}

async function getGateToken(open: boolean, code: string): Promise<string | undefined> {
  if (open) return undefined;
  const d = await mApi<{ gateToken: string }>("gate", { code });
  return d.gateToken;
}

export function AuthScreens() {
  const [mode, setMode] = useState<"welcome" | "login" | "register">("welcome");
  const open = useGate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [handle, setHandle] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function login(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    try { await signInWithEmailAndPassword(auth, email.trim(), password); }
    catch (err: any) { setError(authError(err?.code)); setBusy(false); }
  }

  async function register(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      const gateToken = await getGateToken(open, code);
      await mApi("register", { gateToken, email: email.trim(), password, handle, displayName: name });
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (err: any) { setError(err?.message || "Не удалось создать аккаунт"); setBusy(false); }
  }

  if (mode === "welcome") {
    return (
      <Shell>
        <Logo />
        <button onClick={() => setMode("register")} className="btn-primary w-full py-3.5 text-base mb-3">Создать аккаунт</button>
        <button onClick={() => setMode("login")} className="btn-secondary w-full py-3.5 text-base">У меня уже есть аккаунт</button>
        <p className="text-[11px] text-white/30 text-center mt-6">Сообщения не имеют сквозного шифрования: сервер технически может их читать.</p>
      </Shell>
    );
  }

  const isReg = mode === "register";
  return (
    <Shell>
      <Logo />
      <form onSubmit={isReg ? register : login} className="space-y-3">
        {isReg && (
          <>
            <input autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} placeholder="Имя" maxLength={40} className="input-field" required />
            <input autoComplete="off" value={handle} onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/^@/, ""))} placeholder="@username (латиница, 4–24)" maxLength={24} className="input-field" required />
          </>
        )}
        <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Почта" className="input-field" required />
        <input type="password" autoComplete={isReg ? "new-password" : "current-password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder={isReg ? "Пароль (от 8 символов)" : "Пароль"} className="input-field" required />
        {isReg && !open && <input autoComplete="off" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Код доступа" className="input-field" required />}
        {error && <p className="text-sm text-red-300">{error}</p>}
        <button disabled={busy} className="btn-primary w-full py-3.5 text-base flex items-center justify-center gap-2 disabled:opacity-60">
          {busy && <Loader2 size={18} className="animate-spin" />} {isReg ? "Создать аккаунт" : "Войти"}
        </button>
      </form>
      <button onClick={() => { setMode(isReg ? "login" : "register"); setError(""); }} className="block mx-auto mt-4 text-sm text-accent">
        {isReg ? "Уже есть аккаунт? Войти" : "Нет аккаунта? Создать"}
      </button>
      <button onClick={() => { setMode("welcome"); setError(""); }} className="block mx-auto mt-2 text-xs text-white/40">Назад</button>
    </Shell>
  );
}

/** Человек уже вошёл на сайте Velox, но аккаунта MiliGram ещё нет — достаточно имени и @username. */
export function JoinScreen({ defaultName, onLogout }: { defaultName: string; onLogout: () => void }) {
  const open = useGate();
  const [name, setName] = useState(defaultName);
  const [handle, setHandle] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function join(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      const gateToken = await getGateToken(open, code);
      await mApi("join", { gateToken, handle, displayName: name });
    } catch (err: any) { setError(err?.message || "Не удалось создать аккаунт"); setBusy(false); }
  }
  return (
    <Shell>
      <Logo />
      <p className="text-center text-sm text-white/60 mb-4">Ещё один шаг: выбери имя и @username для MiliGram.</p>
      <form onSubmit={join} className="space-y-3">
        <input autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} placeholder="Имя" maxLength={40} className="input-field" required />
        <input autoComplete="off" value={handle} onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/^@/, ""))} placeholder="@username (латиница, 4–24)" maxLength={24} className="input-field" required />
        {!open && <input autoComplete="off" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Код доступа" className="input-field" required />}
        {error && <p className="text-sm text-red-300">{error}</p>}
        <button disabled={busy} className="btn-primary w-full py-3.5 text-base disabled:opacity-60">{busy ? "..." : "Продолжить"}</button>
      </form>
      <button onClick={onLogout} className="block mx-auto mt-4 text-xs text-white/40">Выйти из аккаунта</button>
    </Shell>
  );
}
