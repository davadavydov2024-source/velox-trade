"use client";

import { useEffect, useState } from "react";
import { useAuth } from "./authContext";
import { auth } from "./firebase";

export interface PayoutSummary {
  released: number;
  holdingTotal: number;
  holdingItems: { orderId: string; amount: number; releaseAt: number }[];
  escrowTotal: number;
  escrowCount: number;
}

/**
 * Сводка «денег в пути» продавца: что ещё ждёт подтверждения покупателя и что лежит в 48-часовом холде.
 * Заодно сервер зачисляет выплаты, у которых холд уже закончился, — если что-то зачислилось, обновляем
 * профиль, чтобы баланс на экране сразу стал актуальным.
 */
export function useMyPayouts(): PayoutSummary | null {
  const { user, refreshProfile } = useAuth();
  const [data, setData] = useState<PayoutSummary | null>(null);

  useEffect(() => {
    if (!user) {
      setData(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const idToken = await auth.currentUser?.getIdToken();
        if (!idToken) return;
        const res = await fetch("/api/payouts/mine", { method: "POST", headers: { Authorization: `Bearer ${idToken}` } });
        if (!res.ok) return;
        const json = (await res.json()) as PayoutSummary;
        if (cancelled) return;
        setData(json);
        if (json.released > 0) refreshProfile();
      } catch {
        // сводка — необязательная часть экрана, ошибку не показываем
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);

  return data;
}

/** «через 5 ч 20 мин» / «через 12 мин» / «скоро». */
export function formatTimeLeft(releaseAt: number, now = Date.now()): string {
  const ms = releaseAt - now;
  if (ms <= 60_000) return "скоро";
  const totalMin = Math.ceil(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h >= 24) return `через ${Math.floor(h / 24)} д ${h % 24} ч`;
  if (h > 0) return `через ${h} ч ${m} мин`;
  return `через ${m} мин`;
}
