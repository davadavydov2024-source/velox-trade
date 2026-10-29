"use client";

import { ReactNode, useEffect, useState } from "react";
import { ShieldCheck, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/authContext";

const TRUST_DAYS = 30;

function trustKey(uid: string) {
  return `vt_2fa_trusted_${uid}`;
}

function isDeviceTrusted(uid: string): boolean {
  const raw = localStorage.getItem(trustKey(uid));
  if (!raw) return false;
  const expiresAt = Number(raw);
  if (!expiresAt || Date.now() > expiresAt) {
    localStorage.removeItem(trustKey(uid));
    return false;
  }
  return true;
}

function trustDevice(uid: string) {
  localStorage.setItem(trustKey(uid), String(Date.now() + TRUST_DAYS * 24 * 60 * 60 * 1000));
}

export function TwoFactorGate({ children }: { children: ReactNode }) {
  const { user, profile, logout } = useAuth();
  const [verified, setVerified] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsGate = !!profile?.twoFactorEnabled;

  useEffect(() => {
    if (!user) return;
    setVerified(isDeviceTrusted(user.uid));
  }, [user]);

  if (!user || !profile || !needsGate || verified) return <>{children}</>;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setError(null);
    setBusy(true);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/2fa/verify-login", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ code: code.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Неверный код");
        return;
      }
      trustDevice(user.uid);
      setVerified(true);
    } catch {
      setError("Не удалось проверить код — проверь соединение");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-bg">
      <div className="card p-8 max-w-sm w-full text-center space-y-4">
        <ShieldCheck className="mx-auto text-accent" size={40} />
        <h1 className="text-xl font-bold">Двухфакторная аутентификация</h1>
        <p className="text-white/50 text-sm">
          Введи 6-значный код из приложения-аутентификатора (или один из резервных кодов). Это устройство запомнится на 30 дней.
        </p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            autoFocus
            inputMode="text"
            placeholder="000000"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="input-field w-full text-center text-lg tracking-[0.3em] font-mono"
            maxLength={11}
          />
          {error && <p className="text-xs text-red-400">{error}</p>}
          <button type="submit" disabled={busy || !code.trim()} className="btn-primary w-full py-2.5 text-sm flex items-center justify-center gap-2 disabled:opacity-50">
            {busy ? <Loader2 size={16} className="animate-spin" /> : null}
            Подтвердить
          </button>
        </form>
        <button onClick={() => logout()} className="text-xs text-white/40 hover:text-white/70">
          Выйти из аккаунта
        </button>
      </div>
    </div>
  );
}
