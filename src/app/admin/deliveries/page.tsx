"use client";

import { useEffect, useState } from "react";
import { PackageCheck, User, Bot, Clock, ExternalLink } from "lucide-react";
import { getAllDeliveries, adminUpdateDeliveryStatus, DELIVERY_TIMEOUT_MS } from "@/lib/deliveries";
import { Delivery, DeliveryStatus } from "@/types";
import { useToast } from "@/lib/toastContext";

const STATUS_LABEL: Record<DeliveryStatus, { text: string; color: string }> = {
  awaiting_nickname: { text: "Ждём ник покупателя", color: "#9aa3b2" },
  awaiting_transfer: { text: "Ждём передачу боту", color: "#ff9800" },
  received_by_bot: { text: "Готово к выдаче", color: "#4a6cf7" },
  delivered: { text: "Выдано", color: "#4caf50" },
  expired: { text: "Истекло", color: "#f44336" },
};

function isEffectivelyExpired(d: Delivery): boolean {
  return (d.status === "awaiting_nickname" || d.status === "awaiting_transfer") && Date.now() > d.expiresAt;
}

function Countdown({ expiresAt }: { expiresAt: number }) {
  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force((v) => v + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const msLeft = expiresAt - Date.now();
  if (msLeft <= 0) return <span className="text-red-400">время вышло</span>;
  const mins = Math.floor(msLeft / 60000);
  const secs = Math.floor((msLeft % 60000) / 1000);
  return (
    <span className="text-white/50">
      осталось {mins}:{secs.toString().padStart(2, "0")}
    </span>
  );
}

export default function AdminDeliveriesPage() {
  const { toast } = useToast();
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"active" | "all">("active");

  useEffect(() => {
    refresh();
  }, []);

  async function refresh() {
    setLoading(true);
    setDeliveries(await getAllDeliveries());
    setLoading(false);
  }

  async function advance(d: Delivery, next: "received_by_bot" | "delivered") {
    setBusyId(d.id);
    try {
      await adminUpdateDeliveryStatus(d.orderId, next);
      toast("success", next === "received_by_bot" ? "Отмечено: бот получил предмет" : "Отмечено: предмет выдан покупателю");
      await refresh();
    } catch (err: any) {
      toast("error", err?.message || "Не удалось обновить статус");
    } finally {
      setBusyId(null);
    }
  }

  const shown = deliveries.filter((d) => filter === "all" || (d.status !== "delivered" && !isEffectivelyExpired(d)));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-1 flex items-center gap-2">
          <PackageCheck size={22} /> Выдача товаров
        </h1>
        <p className="text-sm text-white/40 max-w-2xl">
          Очередь выдач через бота-посредника (эскроу). Проверяй фактическую передачу предмета в самой игре и
          продвигай статус вручную — сначала «бот получил от продавца», потом «выдано покупателю».
          Список ботов настраивается в разделе «Боты-посредники».
        </p>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => setFilter("active")}
          className={`px-3 py-1.5 rounded-btn text-xs font-medium ${filter === "active" ? "bg-accent text-black" : "bg-surface text-white/50"}`}
        >
          Активные
        </button>
        <button
          onClick={() => setFilter("all")}
          className={`px-3 py-1.5 rounded-btn text-xs font-medium ${filter === "all" ? "bg-accent text-black" : "bg-surface text-white/50"}`}
        >
          Все
        </button>
      </div>

      {loading ? (
        <div className="card p-10 text-center text-white/40">Загрузка...</div>
      ) : shown.length === 0 ? (
        <div className="card p-10 text-center text-white/40">
          {filter === "active" ? "Активных выдач сейчас нет." : "Выдач пока не было."}
        </div>
      ) : (
        <div className="space-y-3">
          {shown.map((d) => {
            const expired = isEffectivelyExpired(d);
            const status: DeliveryStatus = expired ? "expired" : d.status;
            return (
              <div key={d.id} className={`card p-4 space-y-3 ${status === "delivered" || expired ? "opacity-60" : ""}`}>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <p className="font-medium text-sm">{d.productName}</p>
                    <p className="text-xs text-white/40">Заказ #{d.orderId.slice(0, 8)} · игра: {d.gameId}</p>
                  </div>
                  <span
                    className="text-[10px] font-semibold px-2 py-1 rounded-md shrink-0"
                    style={{ background: `${STATUS_LABEL[status].color}22`, color: STATUS_LABEL[status].color }}
                  >
                    {STATUS_LABEL[status].text}
                  </span>
                </div>

                <div className="grid sm:grid-cols-2 gap-3 text-xs">
                  <div className="flex items-start gap-2">
                    <User size={13} className="text-white/30 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-white/30">Покупатель</p>
                      <p className="text-white/70">{d.buyerNickname || "ещё не указан"}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Bot size={13} className="text-white/30 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-white/30">Бот-посредник</p>
                      <p className="text-white/70 flex items-center gap-1">
                        {d.botNickname || "ещё не назначен"}
                        {d.botProfileLink && (
                          <a href={d.botProfileLink} target="_blank" rel="noopener noreferrer" className="text-accent">
                            <ExternalLink size={11} />
                          </a>
                        )}
                      </p>
                    </div>
                  </div>
                </div>

                {(d.status === "awaiting_nickname" || d.status === "awaiting_transfer") && !expired && (
                  <div className="flex items-center gap-1.5 text-xs">
                    <Clock size={12} className="text-white/30" />
                    <Countdown expiresAt={d.expiresAt} />
                  </div>
                )}

                {!expired && (
                  <div className="flex gap-2">
                    {d.status === "awaiting_transfer" && (
                      <button
                        onClick={() => advance(d, "received_by_bot")}
                        disabled={busyId === d.id}
                        className="btn-primary px-4 py-2 text-xs disabled:opacity-50"
                      >
                        ✅ Бот получил предмет от продавца
                      </button>
                    )}
                    {d.status === "received_by_bot" && (
                      <button
                        onClick={() => advance(d, "delivered")}
                        disabled={busyId === d.id}
                        className="btn-primary px-4 py-2 text-xs disabled:opacity-50"
                      >
                        📦 Выдано покупателю
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
