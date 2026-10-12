"use client";

import { useEffect, useState } from "react";
import { PackageCheck, User, Bot, Clock, ExternalLink, XCircle, History, ChevronDown } from "lucide-react";
import { getAllDeliveries, adminUpdateDeliveryStatus, DELIVERY_TIMEOUT_MS } from "@/lib/deliveries";
import { Delivery, DeliveryStatus } from "@/types";
import { useToast } from "@/lib/toastContext";
import { RobloxUserPreview } from "@/components/RobloxUserPreview";

const STATUS_LABEL: Record<DeliveryStatus, { text: string; color: string }> = {
  awaiting_nickname: { text: "Ждём ник покупателя", color: "#9aa3b2" },
  awaiting_transfer: { text: "Ждём передачу боту", color: "#ff9800" },
  received_by_bot: { text: "Готово к выдаче", color: "#4a6cf7" },
  delivered: { text: "Выдано", color: "#4caf50" },
  cancelled: { text: "Отменено", color: "#f44336" },
  expired: { text: "Истекло", color: "#f44336" },
};

const CANCELLABLE_STATUSES: DeliveryStatus[] = ["awaiting_nickname", "awaiting_transfer", "received_by_bot", "expired"];

// Быстрые причины отмены — один клик вместо ввода текста; увидят обе стороны в чате заказа.
const QUICK_REASONS = [
  "Продавец не передал предмет",
  "Покупатель не вышел на связь",
  "Спор / жалоба",
  "Подозрение на мошенничество",
  "Ошибка в заказе",
];

function isEffectivelyExpired(d: Delivery): boolean {
  return (d.status === "awaiting_nickname" || d.status === "awaiting_transfer") && !!d.expiresAt && Date.now() > d.expiresAt;
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
  const [logsOpenId, setLogsOpenId] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Delivery | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelRefund, setCancelRefund] = useState(false);

  useEffect(() => {
    refresh();
  }, []);

  async function refresh() {
    setLoading(true);
    setDeliveries(await getAllDeliveries());
    setLoading(false);
  }

  async function advance(d: Delivery, next: "received_by_bot" | "delivered") {
    const confirmText =
      next === "received_by_bot"
        ? `Подтвердить: бот-посредник (${d.botNickname}) получил «${d.productName}» от продавца по заказу для покупателя ${d.buyerNickname}?`
        : `Подтвердить: покупатель ${d.buyerNickname} получил «${d.productName}» у бота-посредника (${d.botNickname})?`;
    if (!confirm(confirmText)) return;

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

  function openCancel(d: Delivery) {
    setCancelTarget(d);
    setCancelReason("");
    // Для призов колеса и обменов денег за них не платили — возвращать нечего.
    setCancelRefund(false);
  }

  async function confirmCancel() {
    const d = cancelTarget;
    if (!d) return;
    setBusyId(d.id);
    try {
      await adminUpdateDeliveryStatus(d.orderId, "cancelled", cancelReason.trim() || undefined, cancelRefund);
      toast("success", cancelRefund ? "Выдача отменена, деньги возвращены" : "Выдача отменена");
      setCancelTarget(null);
      await refresh();
    } catch (err: any) {
      toast("error", err?.message || "Не удалось отменить выдачу");
    } finally {
      setBusyId(null);
    }
  }

  const shown = deliveries.filter((d) => filter === "all" || (d.status !== "delivered" && d.status !== "cancelled" && !isEffectivelyExpired(d)));

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
              <div key={d.id} className={`card p-4 space-y-3 ${status === "delivered" || status === "cancelled" || expired ? "opacity-60" : ""}`}>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <p className="font-medium text-sm flex items-center gap-1.5">
                      {d.productName}
                      {d.source === "wheel" && (
                        <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-300">🎡 колесо</span>
                      )}
                      {d.source === "trade" && (
                        <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-300">🔄 обмен</span>
                      )}
                    </p>
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
                    <div className="min-w-0 flex-1">
                      <p className="text-white/30">Покупатель</p>
                      <p className="text-white/70">{d.buyerNickname || "ещё не указан"}</p>
                      {d.buyerNickname && <div className="mt-1"><RobloxUserPreview username={d.buyerNickname} /></div>}
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

                {(d.status === "awaiting_nickname" || d.status === "awaiting_transfer") && !expired && d.expiresAt && (
                  <div className="flex items-center gap-1.5 text-xs">
                    <Clock size={12} className="text-white/30" />
                    <Countdown expiresAt={d.expiresAt} />
                  </div>
                )}

                {d.status !== "cancelled" && d.status !== "delivered" && (
                  <div className="flex gap-2 flex-wrap">
                    {!expired && d.status === "awaiting_transfer" && (
                      <button
                        onClick={() => advance(d, "received_by_bot")}
                        disabled={busyId === d.id}
                        className="btn-primary px-4 py-2 text-xs disabled:opacity-50"
                      >
                        ✅ Бот получил предмет от продавца
                      </button>
                    )}
                    {!expired && d.status === "received_by_bot" && (
                      <button
                        onClick={() => advance(d, "delivered")}
                        disabled={busyId === d.id}
                        className="btn-primary px-4 py-2 text-xs disabled:opacity-50"
                      >
                        📦 Выдано покупателю
                      </button>
                    )}
                    {CANCELLABLE_STATUSES.includes(d.status) && (
                      <button
                        onClick={() => openCancel(d)}
                        disabled={busyId === d.id}
                        className="px-4 py-2 text-xs rounded-btn bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                      >
                        <XCircle size={13} /> Отменить выдачу
                      </button>
                    )}
                  </div>
                )}

                {d.status === "cancelled" && (
                  <p className="text-xs text-white/30">
                    Отменено администрацией{d.cancelReason ? `: «${d.cancelReason}»` : ""}
                  </p>
                )}

                {d.logs && d.logs.length > 0 && (
                  <div className="pt-2 border-t border-white/5">
                    <button
                      type="button"
                      onClick={() => setLogsOpenId((cur) => (cur === d.id ? null : d.id))}
                      className="text-xs text-white/30 hover:text-white/60 flex items-center gap-1"
                    >
                      <History size={12} /> Полный лог ({d.logs.length}){" "}
                      <ChevronDown size={11} className={logsOpenId === d.id ? "rotate-180" : ""} />
                    </button>
                    {logsOpenId === d.id && (
                      <ul className="mt-2 space-y-1.5">
                        {d.logs.map((log, i) => (
                          <li key={i} className="text-[11px] text-white/40 flex gap-2">
                            <span className="text-white/25 shrink-0">
                              {new Date(log.at).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                            </span>
                            <span className="text-white/20 shrink-0">[{log.actor}]</span>
                            <span>{log.action}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {cancelTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={() => busyId === null && setCancelTarget(null)}
        >
          <div className="card p-5 w-full max-w-md space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-red-500/15 text-red-400 flex items-center justify-center shrink-0">
                <XCircle size={20} />
              </div>
              <div className="min-w-0">
                <h2 className="font-bold">Отменить выдачу?</h2>
                <p className="text-xs text-white/40 truncate">
                  «{cancelTarget.productName}» · покупатель {cancelTarget.buyerNickname ?? "—"}
                </p>
              </div>
            </div>

            <div>
              <p className="text-xs text-white/40 mb-2">Причина (увидят обе стороны в чате):</p>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_REASONS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setCancelReason(r)}
                    className={`px-2.5 py-1 rounded-full text-[11px] transition-colors ${
                      cancelReason === r ? "bg-accent text-black font-medium" : "bg-white/5 text-white/60 hover:bg-white/10"
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
              <input
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                maxLength={300}
                placeholder="Или напиши свою причину (необязательно)"
                className="input-field py-2 text-sm w-full mt-2"
              />
            </div>

            {cancelTarget.source !== "wheel" && cancelTarget.source !== "trade" && (
              <label className="flex items-start gap-2.5 p-3 rounded-btn bg-white/5 cursor-pointer text-sm">
                <input type="checkbox" checked={cancelRefund} onChange={(e) => setCancelRefund(e.target.checked)} className="mt-0.5 accent-[var(--color-accent)]" />
                <span>
                  Вернуть деньги покупателю
                  <span className="block text-[11px] text-white/35">
                    Вернёт сумму заказа на баланс и товар на склад. Работает, пока заказ не подтверждён покупателем.
                  </span>
                </span>
              </label>
            )}

            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setCancelTarget(null)} disabled={busyId !== null} className="btn-secondary px-4 py-2 text-sm">
                Назад
              </button>
              <button
                type="button"
                onClick={confirmCancel}
                disabled={busyId !== null}
                className="px-4 py-2 text-sm rounded-btn bg-red-500 hover:bg-red-600 text-white font-medium transition-colors disabled:opacity-50"
              >
                {busyId !== null ? "Отменяем..." : "Отменить выдачу"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
