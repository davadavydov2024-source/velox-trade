"use client";

import { useEffect } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/authContext";

const HEARTBEAT_MS = 60 * 1000; // раз в минуту — этого достаточно при пороге "онлайн" в 2 минуты

/** Пока сайт открыт у залогиненного пользователя, периодически помечает его как "в сети"
 * (users/{uid}.lastActiveAt). Работает только на вкладке, которая сейчас видна (visibilitychange),
 * чтобы не жечь записи зря, когда вкладка свёрнута надолго. */
export function PresenceSync() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    function touch() {
      if (document.visibilityState !== "visible") return;
      updateDoc(doc(db, "users", user!.uid), { lastActiveAt: Date.now() }).catch(() => {});
    }

    touch();
    const interval = setInterval(touch, HEARTBEAT_MS);
    document.addEventListener("visibilitychange", touch);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", touch);
    };
  }, [user]);

  return null;
}
