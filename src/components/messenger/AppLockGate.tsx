"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Fingerprint, Lock } from "lucide-react";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { PinPad } from "./PinPad";
import { clearFails, hasBio, hasPin, loadLock, lockedUntil, LockConfig, registerFail, saveLock, verifyBiometric, verifyPin } from "./appLock";
import "./applock.css";

/** Экран блокировки: закрывает мессенджер, пока не введён код-пароль или не пройдена биометрия. Блокируется при запуске и после времени в фоне (настраивается). */
export function AppLockGate({ uid }: { uid: string }) {
  const [cfg, setCfg] = useState<LockConfig | null>(() => (typeof window === "undefined" ? null : loadLock(uid)));
  const [locked, setLocked] = useState<boolean>(() => (typeof window === "undefined" ? false : !!loadLock(uid)));
  const [msg, setMsg] = useState("");
  const [wait, setWait] = useState(0); // секунд до конца паузы после ошибок
  const [reset, setReset] = useState(0);
  const hiddenAt = useRef(0);
  const cfgRef = useRef(cfg);
  cfgRef.current = cfg;

  // настройки изменились (включили/выключили/сменили)
  useEffect(() => {
    const onChange = () => { const c = loadLock(uid); setCfg(c); if (!c) setLocked(false); };
    const onNow = () => { if (loadLock(uid)) { setCfg(loadLock(uid)); setLocked(true); setMsg(""); } };
    window.addEventListener("mx-lock-changed", onChange);
    window.addEventListener("mx-lock-now", onNow);
    return () => { window.removeEventListener("mx-lock-changed", onChange); window.removeEventListener("mx-lock-now", onNow); };
  }, [uid]);

  // повторная блокировка после времени в фоне
  useEffect(() => {
    const onVis = () => {
      const c = cfgRef.current;
      if (document.visibilityState === "hidden") { hiddenAt.current = Date.now(); return; }
      if (c && c.timeout >= 0 && hiddenAt.current && Date.now() - hiddenAt.current >= c.timeout * 1000) setLocked(true);
      hiddenAt.current = 0;
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  // пауза после серии ошибок
  useEffect(() => {
    if (!locked) return;
    const tick = () => setWait(Math.max(0, Math.ceil((lockedUntil(uid) - Date.now()) / 1000)));
    tick();
    const t = setInterval(tick, 500);
    return () => clearInterval(t);
  }, [locked, uid]);

  const unlock = useCallback(() => { clearFails(uid); setMsg(""); setLocked(false); }, [uid]);

  const tryBio = useCallback(async () => {
    const c = cfgRef.current;
    if (!c || !hasBio(c)) return;
    if (await verifyBiometric(c.credId!)) unlock();
    else setMsg("Не удалось распознать. Попробуй ещё раз или введи код");
  }, [unlock]);

  // при показе экрана сразу просим биометрию (в некоторых браузерах нужен тап — тогда сработает кнопка)
  useEffect(() => { if (locked && hasBio(cfgRef.current)) tryBio(); }, [locked, tryBio]);

  if (!locked || !cfg) return null;

  const onPin = async (pin: string) => {
    if (lockedUntil(uid) > Date.now()) return false;
    if (await verifyPin(cfg, pin)) { unlock(); return true; }
    const until = registerFail(uid);
    setMsg(until ? "Слишком много попыток" : "Неверный код");
    setWait(Math.max(0, Math.ceil((until - Date.now()) / 1000)));
    return false;
  };

  const pinOn = hasPin(cfg);
  const bioOn = hasBio(cfg);
  return (
    <div className="al-wrap" role="dialog" aria-label="Блокировка MiliGram">
      <div className="al-ava"><Lock size={34} color="#fff" /></div>
      <h1 className="al-title">MiliGram заблокирован</h1>
      <p className={`al-sub ${msg ? "err" : ""}`}>
        {wait > 0 ? `Подожди ${wait} с и попробуй снова` : msg || (pinOn ? "Введи код-пароль" : "Подтверди, что это ты")}
      </p>

      {pinOn ? (
        <PinPad disabled={wait > 0} onComplete={onPin} onBio={bioOn ? tryBio : undefined} resetKey={reset} />
      ) : (
        <button type="button" className="al-bio" style={{ marginTop: 26 }} onClick={tryBio}><Fingerprint size={20} /> Разблокировать</button>
      )}

      <button
        type="button"
        className="al-link"
        onClick={() => {
          if (!confirm("Выйти из аккаунта? Блокировка на этом устройстве сбросится — сообщения и чаты останутся на сервере.")) return;
          saveLock(uid, null);
          signOut(auth).catch(() => {});
          setReset((r) => r + 1);
        }}
      >
        Забыл код / не получается — выйти из аккаунта
      </button>
    </div>
  );
}
