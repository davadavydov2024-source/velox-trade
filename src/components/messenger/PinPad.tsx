"use client";

import { useEffect, useRef, useState } from "react";
import { Delete, Fingerprint } from "lucide-react";
import { PIN_LENGTH } from "./appLock";
import "./applock.css";

/**
 * Цифровая клавиатура с индикатором ввода. onComplete получает введённый код и возвращает true (принят) / false (неверно — трясёт и очищает).
 * disabled — например, пока идёт пауза после ошибок. onBio — кнопка отпечатка/Face ID слева внизу.
 */
export function PinPad({ onComplete, disabled, onBio, resetKey }: { onComplete: (pin: string) => Promise<boolean> | boolean; disabled?: boolean; onBio?: () => void; resetKey?: number }) {
  const [pin, setPin] = useState("");
  const [shake, setShake] = useState(false);
  const busy = useRef(false);

  useEffect(() => { setPin(""); }, [resetKey]);

  const push = async (d: string) => {
    if (disabled || busy.current || pin.length >= PIN_LENGTH) return;
    const next = pin + d;
    setPin(next);
    if (next.length < PIN_LENGTH) return;
    busy.current = true;
    const ok = await onComplete(next);
    busy.current = false;
    if (!ok) {
      setShake(true);
      setTimeout(() => { setShake(false); setPin(""); }, 350);
    }
  };
  const back = () => !busy.current && setPin((p) => p.slice(0, -1));

  // ввод с физической клавиатуры (Windows/Mac)
  const ref = useRef({ push, back });
  ref.current = { push, back };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) ref.current.push(e.key);
      else if (e.key === "Backspace") ref.current.back();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <div className={`al-dots ${shake ? "al-shake" : ""}`}>
        {Array.from({ length: PIN_LENGTH }, (_, i) => <span key={i} className={`al-dot ${i < pin.length ? "on" : ""}`} />)}
      </div>
      <div className="al-pad">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <button key={d} type="button" className="al-key" disabled={disabled} onClick={() => push(d)}>{d}</button>
        ))}
        {onBio ? <button type="button" className="al-key ghost" onClick={onBio} aria-label="Face ID / отпечаток"><Fingerprint size={28} /></button> : <span />}
        <button type="button" className="al-key" disabled={disabled} onClick={() => push("0")}>0</button>
        <button type="button" className="al-key ghost" onClick={back} aria-label="Стереть"><Delete size={24} /></button>
      </div>
    </>
  );
}
