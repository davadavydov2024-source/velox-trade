"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/authContext";
import { getOrdersForUser, confirmOrderReceipt } from "@/lib/users";
import { getOrderChat, sendOrderChatMessage } from "@/lib/orderChats";
import { createDispute, getDispute } from "@/lib/disputes";
import { createReview } from "@/lib/reviews";
import { Order, OrderChatMessage, Dispute } from "@/types";
import { useToast } from "@/lib/toastContext";
import { MessageCircle, CheckCircle2, AlertTriangle, Star, Send } from "lucide-react";

const STATUS_LABEL: Record<Order["status"], { text: string; color: string }> = {
  pending_confirmation: { text: "Ждёт подтверждения", color: "#ff9800" },
  confirmed: { text: "Подтверждён", color: "#4caf50" },
  disputed: { text: "Спор", color: "#f44336" },
  cancelled: { text: "Отменён", color: "#9aa3b2" },
};

function OrderCard({ order, buyerName }: { order: Order; buyerName: string }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(order.status);

  const [chatOpen, setChatOpen] = useState(false);
  const [messages, setMessages] = useState<OrderChatMessage[]>([]);
  const [chatText, setChatText] = useState("");
  const [chatLoading, setChatLoading] = useState(false);

  const [disputeOpen, setDisputeOpen] = useState(false);
  const [disputeReason, setDisputeReason] = useState("");
  const [dispute, setDispute] = useState<Dispute | null>(null);

  const [reviewOpen, setReviewOpen] = useState(false);
  const [rating, setRating] = useState<1 | 2 | 3 | 4 | 5>(5);
  const [reviewText, setReviewText] = useState("");
  const [reviewDone, setReviewDone] = useState(!!order.reviewSubmitted);

  useEffect(() => {
    if (status === "disputed") {
      getDispute(order.id).then(setDispute).catch(() => {});
    }
  }, [status, order.id]);

  async function toggleChat() {
    if (!chatOpen) {
      setChatLoading(true);
      try {
        const chat = await getOrderChat(order.id);
        setMessages(chat?.messages ?? []);
      } finally {
        setChatLoading(false);
      }
    }
    setChatOpen((v) => !v);
  }

  async function handleSendChat(e: React.FormEvent) {
    e.preventDefault();
    if (!chatText.trim()) return;
    const text = chatText.trim();
    setChatText("");
    setMessages((m) => [...m, { from: "buyer", text, createdAt: Date.now() }]);
    try {
      await sendOrderChatMessage(order.id, order.userId, order.sellerId, "buyer", text);
    } catch {
      toast("error", "Не удалось отправить сообщение");
    }
  }

  async function handleConfirm() {
    setBusy(true);
    try {
      await confirmOrderReceipt(order.id);
      setStatus("confirmed");
      toast("success", "Получение подтверждено! Теперь можно оставить отзыв продавцу.");
    } catch (err: any) {
      toast("error", err?.code === "permission-denied" ? "Нет прав на это действие" : "Не удалось подтвердить");
    } finally {
      setBusy(false);
    }
  }

  async function handleDispute(e: React.FormEvent) {
    e.preventDefault();
    if (!disputeReason.trim()) return;
    setBusy(true);
    try {
      await createDispute({ orderId: order.id, buyerId: order.userId, buyerName, sellerId: order.sellerId, reason: disputeReason.trim() });
      setStatus("disputed");
      setDisputeOpen(false);
      toast("success", "Жалоба отправлена администратору");
    } catch {
      toast("error", "Не удалось отправить жалобу");
    } finally {
      setBusy(false);
    }
  }

  async function handleReview(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await createReview({
        orderId: order.id,
        productId: order.items[0]?.productId ?? "",
        productName: order.items[0]?.name ?? "Товар",
        sellerId: order.sellerId,
        buyerId: order.userId,
        buyerName,
        rating,
        text: reviewText.trim(),
      });
      setReviewDone(true);
      setReviewOpen(false);
      toast("success", "Спасибо за отзыв!");
    } catch (err: any) {
      if (err?.message === "review-already-submitted") toast("warning", "Отзыв уже оставлен");
      else if (err?.message === "order-not-confirmed") toast("error", "Заказ ещё не подтверждён");
      else toast("error", "Не удалось отправить отзыв");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm text-white/40">Заказ #{order.id.slice(0, 8)}</p>
        <span
          className="text-xs font-semibold px-2 py-1 rounded-md"
          style={{ background: `${STATUS_LABEL[status].color}22`, color: STATUS_LABEL[status].color }}
        >
          {STATUS_LABEL[status].text}
        </span>
      </div>

      <div className="space-y-1 text-sm text-white/70">
        {order.items.map((item, i) => (
          <div key={i} className="flex justify-between">
            <span>
              {item.name} ×{item.quantity}
            </span>
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
          <p className="text-red-400 font-medium mb-1">Жалоба: {dispute.reason}</p>
          <p className="text-white/40 text-xs">
            Статус:{" "}
            {dispute.status === "open" ? "рассматривается администратором" : dispute.status === "approved" ? "одобрена" : "отклонена"}
          </p>
        </div>
      )}

      <div className="flex flex-wrap gap-2 mt-3">
        {status === "pending_confirmation" && (
          <>
            <button onClick={handleConfirm} disabled={busy} className="btn-primary px-4 py-2 text-xs flex items-center gap-1.5 disabled:opacity-50">
              <CheckCircle2 size={14} /> Подтвердить получение
            </button>
            <button onClick={() => setDisputeOpen((v) => !v)} className="btn-secondary px-4 py-2 text-xs flex items-center gap-1.5">
              <AlertTriangle size={14} /> Пожаловаться
            </button>
          </>
        )}
        {status === "confirmed" && !reviewDone && (
          <button onClick={() => setReviewOpen((v) => !v)} className="btn-secondary px-4 py-2 text-xs flex items-center gap-1.5">
            <Star size={14} /> Оставить отзыв
          </button>
        )}
        <button onClick={toggleChat} className="btn-secondary px-4 py-2 text-xs flex items-center gap-1.5">
          <MessageCircle size={14} /> Чат с продавцом
        </button>
      </div>

      {disputeOpen && (
        <form onSubmit={handleDispute} className="mt-3 space-y-2">
          <textarea
            value={disputeReason}
            onChange={(e) => setDisputeReason(e.target.value)}
            placeholder="Опиши проблему — что пошло не так с этим заказом"
            rows={2}
            className="input-field py-2 text-sm"
          />
          <button disabled={busy} className="btn-primary px-4 py-2 text-xs disabled:opacity-50">
            Отправить жалобу
          </button>
        </form>
      )}

      {reviewOpen && (
        <form onSubmit={handleReview} className="mt-3 space-y-2">
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" onClick={() => setRating(n as 1 | 2 | 3 | 4 | 5)}>
                <Star size={20} className={n <= rating ? "text-accent fill-accent" : "text-white/20"} />
              </button>
            ))}
          </div>
          <textarea
            value={reviewText}
            onChange={(e) => setReviewText(e.target.value)}
            placeholder="Как всё прошло?"
            rows={2}
            className="input-field py-2 text-sm"
          />
          <button disabled={busy} className="btn-primary px-4 py-2 text-xs disabled:opacity-50">
            Отправить отзыв
          </button>
        </form>
      )}

      {chatOpen && (
        <div className="mt-3 border-t border-border pt-3">
          {chatLoading ? (
            <p className="text-xs text-white/30">Загрузка чата...</p>
          ) : (
            <>
              <div className="space-y-2 max-h-56 overflow-y-auto mb-2">
                {messages.length === 0 ? (
                  <p className="text-xs text-white/30">Сообщений пока нет. Напиши продавцу, если есть вопросы по заказу.</p>
                ) : (
                  messages.map((m, i) => (
                    <div key={i} className={`text-sm max-w-[80%] px-3 py-2 rounded-btn ${m.from === "buyer" ? "bg-accent/15 ml-auto text-right" : "bg-surface"}`}>
                      <p className="text-[10px] text-white/30 mb-0.5">{m.from === "buyer" ? "Ты" : m.from === "admin" ? "Админ" : "Продавец"}</p>
                      {m.text}
                    </div>
                  ))
                )}
              </div>
              <form onSubmit={handleSendChat} className="flex gap-2">
                <input
                  value={chatText}
                  onChange={(e) => setChatText(e.target.value)}
                  placeholder="Написать сообщение..."
                  className="input-field py-2 text-sm flex-1"
                />
                <button className="btn-primary px-3 py-2">
                  <Send size={14} />
                </button>
              </form>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function OrdersPage() {
  const { user, profile } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    getOrdersForUser(user.uid)
      .then(setOrders)
      .finally(() => setLoading(false));
  }, [user]);

  if (loading) return <div className="card p-10 text-center text-white/40">Загрузка истории...</div>;
  if (orders.length === 0) return <div className="card p-10 text-center text-white/40">У вас пока нет заказов.</div>;

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-bold mb-2">История покупок</h1>
      {orders.map((order) => (
        <OrderCard key={order.id} order={order} buyerName={profile?.displayName ?? "Покупатель"} />
      ))}
    </div>
  );
}
