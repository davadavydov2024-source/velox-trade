"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/authContext";
import { getOrdersForSeller, cancelOrderBySeller } from "@/lib/users";
import { subscribeOrderChat, sendOrderChatMessage } from "@/lib/orderChats";
import { createDispute, getDispute } from "@/lib/disputes";
import { getPublicProfileCached } from "@/lib/sellerCache";
import { Order, OrderChatMessage, Dispute } from "@/types";
import { useToast } from "@/lib/toastContext";
import { MessageCircle, AlertTriangle, Ban, Send, ChevronDown, ChevronUp } from "lucide-react";
import { SalesChart } from "@/components/SalesChart";
import { useMascot } from "@/lib/mascotContext";

const STATUS_LABEL: Record<Order["status"], { text: string; color: string }> = {
  pending_confirmation: { text: "Ждёт подтверждения", color: "#ff9800" },
  confirmed: { text: "Подтверждён", color: "#4caf50" },
  disputed: { text: "Спор", color: "#f44336" },
  cancelled: { text: "Отменён", color: "#9aa3b2" },
};

function SaleCard({ order }: { order: Order }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(order.status);
  const [buyerName, setBuyerName] = useState("Покупатель");

  const [chatOpen, setChatOpen] = useState(false);
  const [messages, setMessages] = useState<OrderChatMessage[]>([]);
  const [chatText, setChatText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  const [disputeOpen, setDisputeOpen] = useState(false);
  const [disputeReason, setDisputeReason] = useState("");
  const [dispute, setDispute] = useState<Dispute | null>(null);

  useEffect(() => {
    getPublicProfileCached(order.userId).then((p) => {
      if (p) setBuyerName(p.displayName);
    });
  }, [order.userId]);

  // Живая подписка — сообщения обновляются сами без перезагрузки
  useEffect(() => {
    const unsub = subscribeOrderChat(order.id, (chat) => {
      setMessages(chat?.messages ?? []);
    });
    return unsub;
  }, [order.id]);

  // Автоскролл вниз при новых сообщениях
  useEffect(() => {
    if (chatOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, chatOpen]);

  useEffect(() => {
    if (status === "disputed") {
      getDispute(order.id).then(setDispute).catch(() => {});
    }
  }, [status, order.id]);

  async function handleSendChat(e: React.FormEvent) {
    e.preventDefault();
    if (!chatText.trim()) return;
    const text = chatText.trim();
    setChatText("");
    try {
      await sendOrderChatMessage(order.id, order.userId, order.sellerId, "seller", text);
    } catch {
      toast("error", "Не удалось отправить сообщение");
    }
  }

  async function handleCancel(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await cancelOrderBySeller(order.id, cancelReason.trim() || undefined);
      setStatus("cancelled");
      setCancelOpen(false);
      toast("success", "Заказ отменён, деньги возвращены покупателю");
    } catch (err: any) {
      toast("error", err.message || "Не удалось отменить заказ");
    } finally {
      setBusy(false);
    }
  }

  async function handleDispute(e: React.FormEvent) {
    e.preventDefault();
    if (!disputeReason.trim()) return;
    setBusy(true);
    try {
      await createDispute({ orderId: order.id, buyerId: order.userId, buyerName, sellerId: order.sellerId, reason: disputeReason.trim(), filedBy: "seller" });
      setStatus("disputed");
      setDisputeOpen(false);
      toast("success", "Жалоба на покупателя отправлена администратору");
    } catch {
      toast("error", "Не удалось отправить жалобу");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm text-white/40">
          Заказ #{order.id.slice(0, 8)} · Покупатель: {buyerName}
        </p>
        <span className="text-xs font-semibold px-2 py-1 rounded-md" style={{ background: `${STATUS_LABEL[status].color}22`, color: STATUS_LABEL[status].color }}>
          {STATUS_LABEL[status].text}
        </span>
      </div>

      <div className="space-y-1 text-sm text-white/70">
        {order.items.map((item, i) => (
          <div key={i} className="flex justify-between">
            <span>{item.name} ×{item.quantity}</span>
            <span>{(item.price * item.quantity).toFixed(2)} ₽</span>
          </div>
        ))}
      </div>
      <div className="flex justify-between font-bold mt-2 pt-2 border-t border-border">
        <span>Итого</span>
        <span className="text-accent">{order.total.toFixed(2)} ₽</span>
      </div>

      {status === "disputed" && dispute && (
        <div className="mt-3 p-3 rounded-btn bg-red-500/5 border border-red-500/20 text-sm">
          <p className="text-red-400 font-medium mb-1">Жалоба ({dispute.filedBy === "buyer" ? "от покупателя" : "твоя"}): {dispute.reason}</p>
          <p className="text-white/40 text-xs">
            Статус: {dispute.status === "open" ? "рассматривается администратором" : dispute.status === "approved" ? "одобрена" : "отклонена"}
          </p>
        </div>
      )}

      {/* Кнопки действий — видны сразу, не спрятаны в чате */}
      <div className="flex flex-wrap gap-2 mt-3">
        {status === "pending_confirmation" && (
          <>
            <button onClick={() => setCancelOpen((v) => !v)} className="btn-secondary px-4 py-2 text-xs flex items-center gap-1.5">
              <Ban size={14} /> Отменить заказ
            </button>
            <button onClick={() => setDisputeOpen((v) => !v)} className="btn-secondary px-4 py-2 text-xs flex items-center gap-1.5">
              <AlertTriangle size={14} /> Пожаловаться на покупателя
            </button>
          </>
        )}
        {/* Кнопка чата — только для активных заказов */}
        {status !== "cancelled" && (
          <button onClick={() => setChatOpen((v) => !v)} className="btn-secondary px-4 py-2 text-xs flex items-center gap-1.5">
            <MessageCircle size={14} />
            {chatOpen ? <><ChevronUp size={14} /> Скрыть чат</> : <><ChevronDown size={14} /> Чат с покупателем</>}
          </button>
        )}
      </div>

      {cancelOpen && (
        <form onSubmit={handleCancel} className="space-y-2 mt-3">
          <textarea
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            placeholder="Причина отмены (необязательно)"
            rows={2}
            className="input-field py-2 text-sm"
          />
          <button disabled={busy} className="btn-primary px-4 py-2 text-xs disabled:opacity-50">
            Отменить и вернуть деньги
          </button>
        </form>
      )}

      {disputeOpen && (
        <form onSubmit={handleDispute} className="space-y-2 mt-3">
          <textarea
            value={disputeReason}
            onChange={(e) => setDisputeReason(e.target.value)}
            placeholder="Опиши проблему с этим покупателем"
            rows={2}
            className="input-field py-2 text-sm"
          />
          <button disabled={busy} className="btn-primary px-4 py-2 text-xs disabled:opacity-50">
            Отправить жалобу
          </button>
        </form>
      )}

      {chatOpen && (
        <div className="mt-3 border-t border-border pt-3">
          <div className="space-y-2 max-h-56 overflow-y-auto mb-2">
            {messages.length === 0 ? (
              <p className="text-xs text-white/30">Сообщений пока нет.</p>
            ) : (
              messages.map((m, i) =>
                m.from === "system" ? (
                  <p key={i} className="text-xs text-center text-white/40 italic py-1">{m.text}</p>
                ) : (
                  <div key={i} className={`text-sm max-w-[80%] px-3 py-2 rounded-btn ${m.from === "seller" ? "bg-accent/15 ml-auto text-right" : "bg-surface"}`}>
                    <p className="text-[10px] text-white/30 mb-0.5">{m.from === "seller" ? "Ты" : m.from === "admin" ? "Админ" : buyerName}</p>
                    {m.text}
                  </div>
                )
              )
            )}
            <div ref={messagesEndRef} />
          </div>
          <form onSubmit={handleSendChat} className="flex gap-2">
            <input
              autoComplete="off"
              value={chatText}
              onChange={(e) => setChatText(e.target.value)}
              placeholder="Написать сообщение..."
              className="input-field py-2 text-sm flex-1"
            />
            <button className="btn-primary px-3 py-2"><Send size={14} /></button>
          </form>
        </div>
      )}
    </div>
  );
}

export default function SalesPage() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const { celebrate } = useMascot();

  useEffect(() => {
    if (!user) return;
    getOrdersForSeller(user.uid)
      .then((list) => {
        setOrders(list);
        try {
          const key = `vt_seen_orders_${user.uid}`;
          const seenRaw = localStorage.getItem(key);
          if (seenRaw !== null) {
            const seen = new Set<string>(JSON.parse(seenRaw));
            if (list.some((o) => !seen.has(o.id))) celebrate("sale");
          }
          localStorage.setItem(key, JSON.stringify(list.map((o) => o.id)));
        } catch {}
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  if (loading) return <div className="card p-10 text-center text-white/40">Загрузка продаж...</div>;
  if (orders.length === 0) return <div className="card p-10 text-center text-white/40">У тебя пока нет продаж.</div>;

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-bold mb-2">Мои продажи</h1>
      <SalesChart orders={orders} />
      {orders.map((order) => (
        <SaleCard key={order.id} order={order} />
      ))}
    </div>
  );
}
