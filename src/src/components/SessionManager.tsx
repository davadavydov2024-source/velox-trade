"use client";

import { useEffect, useRef } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/authContext";
import { useToast } from "@/lib/toastContext";
import { getDeviceId, registerSession } from "@/lib/sessions";

/**
 * Привязан к текущему устройству/браузеру:
 * 1) при входе регистрирует (или обновляет) сессию этого устройства — см. lib/sessions.ts,
 *    и шлёт уведомление в Telegram, если устройство новое для этого аккаунта;
 * 2) следит в реальном времени за своей же сессией: если её завершили с другого устройства
 *    (Профиль → Безопасность → «Завершить»), сразу разлогинивает здесь же, без ожидания.
 */
export function SessionManager() {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const registeredFor = useRef<string | null>(null);

  useEffect(() => {
    if (!user) {
      registeredFor.current = null;
      return;
    }
    if (registeredFor.current === user.uid) return;
    registeredFor.current = user.uid;
    registerSession(user.uid).catch(() => {
      // Не критично — просто эта сессия не появится в списке "Активные сессии".
    });
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const deviceId = getDeviceId();
    const unsub = onSnapshot(doc(db, "sessions", `${user.uid}_${deviceId}`), (snap) => {
      if (!snap.exists()) return;
      if (snap.data().revoked) {
        toast("warning", "Эта сессия была завершена с другого устройства.");
        logout();
      }
    });
    return unsub;
  }, [user, logout, toast]);

  return null;
}
