"use client";

import { useEffect, useRef } from "react";
import { doc, setDoc, deleteDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/authContext";
import { useCart } from "@/lib/cartStore";

/** Дублирует локальную корзину в Firestore (только для залогиненных) — нужно исключительно
 * серверному напоминанию о брошенной корзине (см. /api/cron/reminders), на саму работу корзины
 * это никак не влияет, она по-прежнему живёт в localStorage. */
export function CartSync() {
  const { user } = useAuth();
  const lines = useCart((s) => s.lines);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!user) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      const ref = doc(db, "carts", user.uid);
      if (lines.length === 0) {
        deleteDoc(ref).catch(() => {});
        return;
      }
      setDoc(ref, {
        uid: user.uid,
        items: lines.map((l) => ({ productId: l.product.id, name: l.product.name, quantity: l.quantity })),
        total: lines.reduce((s, l) => s + l.product.price * l.quantity, 0),
        updatedAt: Date.now(),
      }).catch(() => {});
    }, 2000);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [user, lines]);

  return null;
}
