"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useToast } from "@/lib/toastContext";
import { describePushError, hasActiveSubscription, isPushSupported, subscribeToPush, syncPushSubscriptionSilently } from "@/lib/webPush";
import { isIosDevice, isNativeShell, isStandaloneDisplay } from "./env";
import "./auth-slasher.css";

const SKIP_KEY = "mx-push-gate-skip";

/** Где вообще можно требовать уведомления: иначе человек застрянет на экране, который не пройти. */
function pushRequired(): boolean {
  if (!isPushSupported()) return false;
  if (isNativeShell()) return false; // Windows/Android-обёртки: web-push там не работает, уведомления у них свои
  if (isIosDevice() && !isStandaloneDisplay()) return false; // iPhone: push только из установленного на «Домой» приложения
  try { if (sessionStorage.getItem(SKIP_KEY)) return false; } catch {}
  return true;
}

/**
 * Обязательные уведомления: пока их нет, мессенджер закрыт экраном «Включи уведомления».
 * Браузер не даёт включить их «насильно» — только по нажатию человека; если он запретил, показываем, как разрешить.
 * Если включить технически нельзя (сервер/браузер без push), даём выйти из экрана, чтобы не заблокировать приложение.
 */
export function NotificationGate({ uid }: { uid: string }) {
  const { toast } = useToast();
  const [state, setState] = useState<"checking" | "ok" | "need">("checking");
  const [denied, setDenied] = useState(false);
  const [techError, setTechError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const check = useCallback(async () => {
    if (!pushRequired()) return setState("ok");
    if (Notification.permission === "granted") {
      await syncPushSubscriptionSilently();
      if (await hasActiveSubscription(uid)) return setState("ok");
    }
    setDenied(Notification.permission === "denied");
    setState("need");
  }, [uid]);

  useEffect(() => { check(); }, [check]);

  // человек мог разрешить уведомления в настройках браузера и вернуться на вкладку
  useEffect(() => {
    if (state !== "need") return;
    const onVis = () => document.visibilityState === "visible" && check();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [state, check]);

  if (state !== "need") return null;

  const enable = async () => {
    setBusy(true);
    setTechError(null);
    try {
      await subscribeToPush(uid);
      toast("success", "Уведомления включены!");
      setState("ok");
    } catch (err) {
      const msg = (err as { message?: string })?.message;
      if (msg === "permission-denied" || Notification.permission === "denied") {
        setDenied(true);
      } else {
        setTechError(describePushError(err).text);
      }
    } finally {
      setBusy(false);
    }
  };

  const skip = () => {
    try { sessionStorage.setItem(SKIP_KEY, "1"); } catch {}
    setState("ok");
  };

  return (
    <div className="sl-auth" style={{ position: "absolute", inset: 0, height: "auto", zIndex: 400 }}>
      <div className="sl-wrap">
        <div className="sl-col" style={{ textAlign: "center" }}>
          <div className="sl-logo" style={{ marginBottom: 20 }}>
            <div style={{ width: 84, height: 84, margin: "0 auto", borderRadius: 26, background: "var(--sl-blue)", display: "grid", placeItems: "center", boxShadow: "0 10px 50px -8px rgba(18,107,247,.75)" }}>
              <Bell size={38} color="#fff" />
            </div>
            <h1 className="sl-title">Включи уведомления</h1>
            <p className="sl-sub">Без них ты не узнаешь о новых сообщениях, пока MiliGram закрыт.</p>
          </div>

          {denied ? (
            <div className="card" style={{ textAlign: "left" }}>
              <p style={{ fontWeight: 600, marginBottom: 8 }}>Уведомления запрещены в браузере</p>
              <p className="mx-muted" style={{ fontSize: 14, lineHeight: 1.5, marginBottom: 14, color: "#8b90a0" }}>
                Нажми на значок замка (или настроек) слева от адреса сайта → «Уведомления» → «Разрешить». Потом вернись сюда — экран закроется сам, либо нажми кнопку ниже.
              </p>
              <button className="btn-primary w-full" onClick={check}>Я разрешил — проверить</button>
            </div>
          ) : (
            <button className="btn-primary w-full" onClick={enable} disabled={busy}>
              {busy ? "Включаю…" : "Включить уведомления"}
            </button>
          )}

          {techError && (
            <div style={{ marginTop: 14 }}>
              <p style={{ color: "#ff8a8a", fontSize: 13.5, marginBottom: 10 }}>{techError}</p>
              <button className="btn-secondary w-full" style={{ height: 46 }} onClick={skip}>Продолжить без уведомлений</button>
            </div>
          )}

          <button style={{ marginTop: 18, fontSize: 13, color: "#5d6272" }} onClick={() => { signOut(auth).catch(() => {}); }}>Выйти из аккаунта</button>
        </div>
      </div>
    </div>
  );
}
