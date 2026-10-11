"use client";

import { Hourglass, Lock } from "lucide-react";
import { PayoutSummary, formatTimeLeft } from "@/lib/payoutsClient";

/** Показывает продавцу деньги, которые ещё не на балансе: заморожены до подтверждения и в 48-часовом холде. */
export function PayoutHoldCard({ data }: { data: PayoutSummary | null }) {
  if (!data || (data.escrowTotal <= 0 && data.holdingTotal <= 0)) return null;
  const next = data.holdingItems[0];
  return (
    <div className="rounded-card border border-yellow-400/20 bg-gradient-to-br from-yellow-400/[0.08] to-transparent p-4">
      <p className="text-xs font-semibold text-yellow-300/90 mb-3 flex items-center gap-1.5">
        <Hourglass size={13} /> Деньги в пути — ещё не на балансе
      </p>
      <div className="grid sm:grid-cols-2 gap-3">
        {data.escrowTotal > 0 && (
          <div className="rounded-btn bg-black/20 p-3">
            <p className="text-lg font-extrabold leading-none">{data.escrowTotal.toFixed(0)} ₽</p>
            <p className="text-xs text-white/55 mt-1.5 flex items-start gap-1.5">
              <Lock size={12} className="mt-0.5 shrink-0" />
              <span>
                Заморожены до подтверждения покупателем ({data.escrowCount} {data.escrowCount === 1 ? "заказ" : "заказов"})
              </span>
            </p>
          </div>
        )}
        {data.holdingTotal > 0 && (
          <div className="rounded-btn bg-black/20 p-3">
            <p className="text-lg font-extrabold leading-none">{data.holdingTotal.toFixed(0)} ₽</p>
            <p className="text-xs text-white/55 mt-1.5">
              В холде 48 часов после подтверждения{next ? ` · ближайшая выплата ${formatTimeLeft(next.releaseAt)}` : ""}
            </p>
          </div>
        )}
      </div>
      <p className="text-[11px] text-white/35 mt-3 leading-relaxed">
        Как это работает: покупатель платит — деньги замораживаются; он подтверждает получение — деньги идут в холд на 48 часов; затем
        автоматически попадают на твой баланс. Если заказ отменяют, деньги сразу возвращаются покупателю.
      </p>
    </div>
  );
}
