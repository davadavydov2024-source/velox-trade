"use client";

import { ReactNode, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/authContext";
import { mApiPublic } from "./api";

export const GATE_STORAGE_KEY = "vc-gate";
const GATE_TTL_MS = 15 * 60 * 1000;

export function saveGateToken(token: string) {
  try {
    sessionStorage.setItem(GATE_STORAGE_KEY, JSON.stringify({ token, ts: Date.now() }));
  } catch {}
}

export function readGateToken(): string | null {
  try {
    const raw = sessionStorage.getItem(GATE_STORAGE_KEY);
    if (!raw) return null;
    const { token, ts } = JSON.parse(raw);
    return token && Date.now() - ts < GATE_TTL_MS ? token : null;
  } catch {
    return null;
  }
}

/**
 * Скрытый вход в мессенджер для сайта Velox Trade: оберни в него логотип в футере —
 * 5 быстрых нажатий подряд откроют шторку «Код доступа». Для остальных посетителей это обычный логотип.
 * Стили — стили сайта (Tailwind), не мессенджера: компонент живёт на страницах магазина.
 */
export function MessengerEntry({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const taps = useRef({ n: 0, last: 0 });

  const onTap = () => {
    const now = Date.now();
    const t = taps.current;
    t.n = now - t.last < 1200 ? t.n + 1 : 1;
    t.last = now;
    if (t.n >= 5) {
      t.n = 0;
      setOpen(true);
    }
  };

  return (
    <>
      <span onClick={onTap} style={{ WebkitTapHighlightColor: "transparent", userSelect: "none" }}>
        {children}
      </span>
      {open && <GateSheet onClose={() => setOpen(false)} />}
    </>
  );
}

function GateSheet({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { user } = useAuth();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    setError("");
    try {
      const res = await mApiPublic<{ gateToken: string }>("gate", { code: code.trim() });
      saveGateToken(res.gateToken);
      onClose();
      router.push(user ? "/vc/start?step=profile" : "/vc/start?step=account");
    } catch (err: any) {
      setError(err?.message || "Неверный код");
      setBusy(false);
    }
  };

  if (!mounted) return null;
  return createPortal(
    <div className="fixed inset-0 z-[200] bg-black/70 flex items-end sm:items-center justify-center" onClick={onClose}>
      <form onSubmit={submit} className="card w-full max-w-sm p-5 pb-7 rounded-b-none sm:rounded-b-[18px]" onClick={(e) => e.stopPropagation()}>
        <p className="font-semibold text-lg mb-1">Код доступа</p>
        <p className="text-sm text-white/40 mb-4">Введите код, чтобы открыть закрытый раздел.</p>
        <input
          autoFocus
          type="password"
          autoComplete="off"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="input-field mb-2"
          placeholder="Код"
        />
        {error && <p className="text-sm text-red-400 mb-2">{error}</p>}
        <button className="btn-primary w-full" disabled={busy || !code.trim()}>
          {busy ? "Проверяю…" : "Продолжить"}
        </button>
      </form>
    </div>,
    document.body
  );
}
