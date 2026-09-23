"use client";

import { CheckCircle2, User, Package, AlertTriangle, ShieldCheck } from "lucide-react";
import { Delivery, Order } from "@/types";

type StepState = "done" | "current" | "pending" | "dashed";

function Dot({ state, icon }: { state: StepState; icon: React.ReactNode }) {
  const base = "w-7 h-7 rounded-full flex items-center justify-center shrink-0 border-2";
  if (state === "done") return <div className={`${base} border-accent bg-accent/15 text-accent`}>{icon}</div>;
  if (state === "current")
    return (
      <div className={`${base} border-accent bg-accent text-black shadow-[0_0_0_4px_rgba(255,152,0,0.16)]`}>{icon}</div>
    );
  if (state === "dashed") return <div className={`${base} border-dashed border-red-400/40 text-red-300/80`}>{icon}</div>;
  return <div className={`${base} border-border bg-surface text-white/30`}>{icon}</div>;
}

function Line({ done }: { done: boolean }) {
  return <div className={`w-0.5 flex-1 my-0.5 min-h-[22px] ${done ? "bg-accent" : "bg-border"}`} />;
}

/**
 * Наглядный вертикальный таймлайн сделки: покупка -> обязательный игровой ник -> выдача (через
 * бота-посредника или напрямую от продавца) -> опциональный спор -> подтверждение получения.
 * Ник теперь показывается как отдельный, всегда обязательный шаг — независимо от того, есть ли
 * для игры бот-посредник (см. фикс в api/deliveries/submit-nickname): раньше это было незаметно
 * скрыто внутри DeliveryPanel и терялось среди остального чата.
 */
export function OrderDealTimeline({ order, delivery }: { order: Order; delivery: Delivery | null | undefined }) {
  const nicknameDone = !!delivery?.buyerNickname;
  const deliveryDone = order.status === "confirmed" || delivery?.status === "delivered";
  const deliveryCurrent = !deliveryDone && (delivery?.status === "awaiting_transfer" || delivery?.status === "received_by_bot");
  const confirmDone = order.status === "confirmed";
  const disputed = order.status === "disputed";

  const nicknameState: StepState = nicknameDone ? "done" : delivery ? "current" : "pending";
  const deliveryState: StepState = deliveryDone ? "done" : deliveryCurrent ? "current" : "pending";
  const disputeState: StepState = disputed ? "current" : "dashed";
  const confirmState: StepState = confirmDone ? "done" : "pending";

  const deliveryHint = !delivery
    ? "Ждёт запуска выдачи"
    : delivery.botNickname
    ? `Через бота-посредника ${delivery.botNickname}`
    : delivery.buyerNickname
    ? "Напрямую от продавца — бот-посредник для этой игры не подключён"
    : "Появится сразу после того, как ты укажешь игровой ник";

  return (
    <div>
      <div className="flex gap-3">
        <div className="flex flex-col items-center">
          <Dot state="done" icon={<CheckCircle2 size={14} />} />
          <Line done />
        </div>
        <div className="pb-4 pt-0.5">
          <p className="text-sm font-medium">Товар куплен</p>
          <p className="text-xs text-white/40">Оплата списана с баланса, продавец уведомлён</p>
        </div>
      </div>

      <div className="flex gap-3">
        <div className="flex flex-col items-center">
          <Dot state={nicknameState} icon={<User size={13} />} />
          <Line done={nicknameDone} />
        </div>
        <div className="pb-4 pt-0.5">
          <p className={`text-sm font-medium ${nicknameState === "pending" ? "text-white/60" : ""}`}>Игровой ник</p>
          <p className="text-xs text-white/40">
            {nicknameDone
              ? `Указан: ${delivery?.buyerNickname}`
              : "Обязательно в любом случае — и для выдачи через бота, и напрямую от продавца"}
          </p>
        </div>
      </div>

      <div className="flex gap-3">
        <div className="flex flex-col items-center">
          <Dot state={deliveryState} icon={<Package size={13} />} />
          <Line done={deliveryDone} />
        </div>
        <div className="pb-4 pt-0.5">
          <p className={`text-sm font-medium ${deliveryState === "pending" ? "text-white/60" : ""}`}>Выдача предмета</p>
          <p className="text-xs text-white/40">{deliveryHint}</p>
        </div>
      </div>

      <div className="flex gap-3">
        <div className="flex flex-col items-center">
          <Dot state={disputeState} icon={<AlertTriangle size={12} />} />
          <Line done={false} />
        </div>
        <div className="pb-4 pt-0.5">
          <p className={`text-sm font-medium ${disputed ? "text-red-300" : "text-white/60"}`}>Спор</p>
          <p className="text-xs text-white/40">
            {disputed ? "Открыт — подключился администратор" : "Необязательный шаг: если что-то пошло не так"}
          </p>
        </div>
      </div>

      <div className="flex gap-3">
        <div className="flex flex-col items-center">
          <Dot state={confirmState} icon={<ShieldCheck size={13} />} />
        </div>
        <div className="pt-0.5">
          <p className={`text-sm font-medium ${confirmState === "pending" ? "text-white/60" : ""}`}>Подтверждение получения</p>
          <p className="text-xs text-white/40">Сделка закроется, продавцу перейдут средства</p>
        </div>
      </div>
    </div>
  );
}
