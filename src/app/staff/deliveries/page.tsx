"use client";

import { useEffect, useState } from "react";
import { PackageCheck, User, Bot, Clock, ExternalLink, Send, MessageSquare } from "lucide-react";
import { getWheelDeliveries, adminUpdateDeliveryStatus } from "@/lib/deliveries";
import { subscribeOrderChat, sendOrderChatMessage } from "@/lib/orderChats";
import { Delivery, DeliveryStatus, OrderChat } from "@/types";
import { useToast } from "@/lib/toastContext";
import { useAuth } from "@/lib/authContext";
import { isAdminUid } from "@/lib/users";
import { RobloxUserPreview } from "@/components/RobloxUserPreview";

const STATUS_LABEL: Record<DeliveryStatus, { text: string; color: string }> = {
  awaiting_nickname: { text: "Ждём ник победителя", color: "#9aa3b2" },
  awaiting_transfer: { text: "Ждём передачу боту", color: "#ff9800" },
  received_by_bot: { text: "Готово к выдаче", color: "#4a6cf7" },
  delivered: { text: "Выдано", color: "#4caf50" },
  cancelled: { text: "Отменено", color: "#f44336" },
  expired: { text: "Истекло", color: "#f44336" },
};

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

export default function StaffDeliveriesPage() {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [chat, setChat] = useState<OrderChat | null>(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);

  const hasAccess = !!user && (isAdminUid(user.uid) || profile?.staffRole === "helper");

  useEffect(() => {
    if (hasAccess) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasAccess]);

  useEffect(() => {
    if (!activeId) {
      setChat(null);
      return;
    }
    const unsub = subscribeOrderChat(activeId, setChat);
    return unsub;
  }, [activeId]);

  async function refresh() {
    setLoading(true);
    try {
      setDeliveries(await getWheelDeliveries());
    } catch (err: any) {
      if (err?.code === "permission-denied") {
        toast("error", "Нет прав на чтение — обратись к администратору за ролью «Помощник».");
      }
    } finally {
      setLoading(false);
    }
  }

  if (!hasAccess) {
    return <p className="text-center text-white/40 py-16">Эта страница доступна только сотрудникам с ролью «Помощник».</p>;
  }

  const active = deliveries.find((d) => d.id === activeId) ?? null;
  const activeList = deliveries.filter((d) => d.status !== "delivered" && d.status !== "cancelled" && d.status !== "expired");

  async function advance(d: Delivery, next: "received_by_bot" | "delivered") {
    const confirmText =
      next === "received_by_bot"
        ? `Подтвердить: бот-посредник (${d.botNickname}) получил «${d.productName}» от продавца для победителя ${d.buyerNickname}?`
        : `Подтвердить: победитель ${d.buyerNickname} получил «${d.productName}» у бота-посредника (${d.botNickname})?`;
    if (!confirm(confirmText)) return;

    setBusyId(d.id);
    try {
      await adminUpdateDeliveryStatus(d.orderId, next);
      toast("success", next === "received_by_bot" ? "Отмечено: бот получил приз" : "Отмечено: приз выдан");
      await refresh();
    } catch (err: any) {
      toast("error", err?.message || "Не удалось обновить статус");
    } finally {
      setBusyId(null);
    }
  }

  async function handleReply(e: React.FormEvent) {
    e.preventDefault();
    if (!active || !reply.trim()) return;
    setSending(true);
    try {
      await sendOrderChatMessage(active.orderId, active.buyerId, active.sellerId, "admin", reply.trim());
      setReply("");
    } catch {
      toast("error", "Не удалось отправить сообщение");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold mb-1 flex items-center gap-2">
          <PackageCheck size={22} /> Выдача призов колеса
        </h1>
        <p className="text-sm text-white/40 max-w-2xl">
          Только призы, выигранные на колесе фортуны. Проверяй фактическую передачу в самой игре и продвигай статус
          вручную — сначала «бот получил от продавца», потом «выдано победителю».
        </p>
      </div>

      <div className="grid md:grid-cols-[340px_1fr] gap-4">
        <div className="card p-2 md:max-h-[70vh] md:overflow-y-auto space-y-1">
          {loading ? (
            <p className="text-center text-white/40 text-sm py-6">Загрузка...</p>
          ) : activeList.length === 0 ? (
            <p className="text-center text-white/40 text-sm py-6">Активных выдач сейчас нет.</p>
          ) : (
            activeList.map((d) => (
              <button
                key={d.id}
                onClick={() => setActiveId(d.id)}
                className={`w-full text-left p-2.5 rounded-btn transition-colors ${activeId === d.id ? "bg-accent/15" : "hover:bg-white/5"}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium truncate">{d.productName}</p>
                  <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded shrink-0" style={{ background: `${STATUS_LABEL[d.status].color}22`, color: STATUS_LABEL[d.status].color }}>
                    {STATUS_LABEL[d.status].text}
                  </span>
                </div>
                <p className="text-xs text-white/40 truncate">{d.buyerNickname || "ник ещё не указан"}</p>
              </button>
            ))
          )}
        </div>

        <div className="card p-4">
          {!active ? (
            <p className="text-center text-white/40 text-sm py-16">Выбери выдачу слева.</p>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <p className="font-medium text-sm">{active.productName}</p>
                  <p className="text-xs text-white/40">Заказ #{active.orderId.slice(0, 8)} · игра: {active.gameId}</p>
                </div>
                <span className="text-[10px] font-semibold px-2 py-1 rounded-md" style={{ background: `${STATUS_LABEL[active.status].color}22`, color: STATUS_LABEL[active.status].color }}>
                  {STATUS_LABEL[active.status].text}
                </span>
              </div>

              <div className="grid sm:grid-cols-2 gap-3 text-xs">
                <div className="flex items-start gap-2">
                  <User size={13} className="text-white/30 mt-0.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-white/30">Победитель</p>
                    <p className="text-white/70">{active.buyerNickname || "ещё не указан"}</p>
                    {active.buyerNickname && <div className="mt-1"><RobloxUserPreview username={active.buyerNickname} /></div>}
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Bot size={13} className="text-white/30 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-white/30">Бот-посредник</p>
                    <p className="text-white/70 flex items-center gap-1">
                      {active.botNickname || "ещё не назначен"}
                      {active.botProfileLink && (
                        <a href={active.botProfileLink} target="_blank" rel="noopener noreferrer" className="text-accent">
                          <ExternalLink size={11} />
                        </a>
                      )}
                    </p>
                  </div>
                </div>
              </div>

              {(active.status === "awaiting_nickname" || active.status === "awaiting_transfer") && active.expiresAt && (
                <div className="flex items-center gap-1.5 text-xs">
                  <Clock size={12} className="text-white/30" />
                  <Countdown expiresAt={active.expiresAt} />
                </div>
              )}

              <div className="flex gap-2">
                {active.status === "awaiting_transfer" && (
                  <button onClick={() => advance(active, "received_by_bot")} disabled={busyId === active.id} className="btn-primary px-4 py-2 text-xs disabled:opacity-50">
                    ✅ Бот получил приз от продавца
                  </button>
                )}
                {active.status === "received_by_bot" && (
                  <button onClick={() => advance(active, "delivered")} disabled={busyId === active.id} className="btn-primary px-4 py-2 text-xs disabled:opacity-50">
                    📦 Выдано победителю
                  </button>
                )}
              </div>

              <div className="border-t border-white/5 pt-3 space-y-2">
                <p className="text-xs font-semibold text-white/50 flex items-center gap-1.5">
                  <MessageSquare size={13} /> Чат по заказу
                </p>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {(chat?.messages ?? []).length === 0 ? (
                    <p className="text-xs text-white/30 text-center py-3">Сообщений пока нет.</p>
                  ) : (
                    (chat?.messages ?? []).map((m, i) => (
                      <div key={i} className={m.from === "system" ? "text-center" : ""}>
                        {m.from === "system" ? (
                          <p className="text-xs text-white/40 italic">{m.text}</p>
                        ) : (
                          <div className={`text-sm p-2 rounded-btn max-w-[85%] ${m.from === "admin" ? "bg-accent/15 ml-auto" : "bg-white/5"}`}>
                            <p className="text-[10px] text-white/40 mb-0.5">
                              {m.from === "buyer" ? "Победитель" : m.from === "seller" ? "Продавец" : "Ты"}
                            </p>
                            {m.text}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
                <form onSubmit={handleReply} className="flex gap-2">
                  <input
                    autoComplete="off"
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    placeholder="Написать в чат..."
                    className="input-field py-2 text-sm flex-1"
                  />
                  <button disabled={sending || !reply.trim()} className="btn-primary px-4 py-2 disabled:opacity-50">
                    <Send size={15} />
                  </button>
                </form>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
