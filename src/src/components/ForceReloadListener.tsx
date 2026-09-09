"use client";

import { useEffect, useRef } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/authContext";

export function ForceReloadListener() {
  const { user } = useAuth();
  const seenGlobal = useRef<number | null>(null);
  const seenUser = useRef<number | null>(null);

  // Глобальное обновление — следим за всеми, залогинен пользователь или нет.
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "settings", "forceReload"), (snap) => {
      const ts = snap.exists() ? (snap.data().timestamp as number) : null;
      if (ts === null) return;
      if (seenGlobal.current === null) {
        seenGlobal.current = ts; // первый снимок при подписке — не перезагружаем
        return;
      }
      if (ts !== seenGlobal.current) {
        seenGlobal.current = ts;
        window.location.reload();
      }
    });
    return unsub;
  }, []);

  // Точечное обновление конкретного пользователя (например, после бана/кика).
  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(doc(db, "users", user.uid), (snap) => {
      const ts = snap.exists() ? (snap.data().forceReloadAt as number | undefined) ?? null : null;
      if (ts === null) return;
      if (seenUser.current === null) {
        seenUser.current = ts;
        return;
      }
      if (ts !== seenUser.current) {
        seenUser.current = ts;
        window.location.reload();
      }
    });
    return unsub;
  }, [user]);

  return null;
}
