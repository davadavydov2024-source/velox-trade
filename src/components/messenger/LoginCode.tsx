"use client";

import { useEffect, useRef, useState } from "react";
import { KeyRound } from "lucide-react";
import { mApi, MApiError } from "./api";
import { getDeviceId } from "@/lib/messenger/client";

/** Экран подтверждения входа: код приходит в MiliGram (чат «MiliGram Push») на уже авторизованное устройство и в Telegram-бота. */
export function LoginCode({ onDone, onLogout }: { onDone: () => void; onLogout: () => void }) {
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(30);
  const [sent, setSent] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const submit = async (c: string) => {
    if (busy) return;
    setBusy(true);
    setErr("");
    try {
      await mApi("session/verify", { deviceId: getDeviceId(), code: c });
      onDone();
    } catch (e) {
      setErr(e instanceof MApiError ? e.message : "Не удалось проверить код");
      setCode("");
      inputRef.current?.focus();
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setSent(false);
    try {
      const r = await mApi<{ resent?: boolean }>("session", { deviceId: getDeviceId(), resend: true });
      setSent(!!r.resent);
      setErr(r.resent ? "" : "Подожди немного перед повторной отправкой");
      setWait(30);
    } catch {
      setErr("Не удалось отправить код");
    }
  };

  return (
    <div className="h-full flex flex-col items-center justify-center px-6 text-center" style={{ background: "var(--mx-bg)" }}>
      <div className="w-20 h-20 rounded-full flex items-center justify-center mb-5" style={{ background: "var(--mx-accent)", color: "#fff" }}><KeyRound size={36} /></div>
      <h1 className="text-[24px] font-bold">Введите код</h1>
      <p className="mx-muted text-[15px] mt-2 max-w-[320px]">Мы отправили 6-значный код в MiliGram на ваше другое устройство (чат «MiliGram Push») и в Telegram-бота.</p>

      <div className="relative mt-7" onClick={() => inputRef.current?.focus()}>
        <div className="flex gap-2 justify-center">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="w-11 h-14 rounded-xl flex items-center justify-center text-[26px] font-semibold tabular-nums" style={{ background: "var(--mx-surface)", border: `2px solid ${i === Math.min(code.length, 5) ? "var(--mx-accent)" : "transparent"}` }}>{code[i] ?? ""}</div>
          ))}
        </div>
        <input
          ref={inputRef}
          value={code}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          className="absolute inset-0 w-full h-full opacity-0"
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, "").slice(0, 6);
            setCode(v);
            if (v.length === 6) submit(v);
          }}
        />
      </div>

      <p className="text-[14px] mt-4 min-h-[20px]" style={{ color: err ? "var(--mx-danger)" : "var(--mx-muted)" }}>{err || (sent ? "Новый код отправлен" : busy ? "Проверяю…" : "")}</p>

      <button disabled={wait > 0} onClick={resend} className="mt-3 text-[15.5px] font-medium disabled:opacity-50" style={{ color: "var(--mx-accent)" }}>
        {wait > 0 ? `Отправить код ещё раз (${wait} с)` : "Отправить код ещё раз"}
      </button>
      <button onClick={onLogout} className="mt-8 text-[14px] mx-muted">Это не я · выйти</button>
    </div>
  );
}
