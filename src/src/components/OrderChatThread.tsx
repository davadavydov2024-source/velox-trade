"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Send, CheckCircle2, AlertTriangle, Star, XCircle } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { useToast } from "@/lib/toastContext";
import { subscribeOrderChat, sendOrderChatMessage } from "@/lib/orderChats";
import { getOrderById, confirmOrderReceipt, cancelOrderBySeller } from "@/lib/users";
import { getProductById } from "@/lib/products";
import { createDispute, getDispute } from "@/lib/disputes";
import { createReview } from "@/lib/reviews";
import { subscribeDelivery } from "@/lib/deliveries";
import { OrderChatMessage, Order, Dispute, Delivery } from "@/types";
import { safeImageSrc } from "@/lib/safeImage";
import { DeliveryPanel } from "@/components/DeliveryPanel";

const STATUS_LABEL: Record<Order["status"], { text: string; color: string }> = {
  pending_confirmation: { text: "Ожидает подтверждения", color: "#ff9800" },
  confirmed: { text: "Завершён", color: "#4caf50" },
  disputed: { text: "Спор", color: "#f44336" },
  cancelled: { text: "Отменён", color: "#9aa3b2" },
};

const STEPS = ["Оплачен", "В процессе", "Завершён"];

const AVATAR_COLORS = ["#ff9800", "#4a6cf7", "#22c55e", "#e879f9", "#38bdf8", "#f87171"];

function avatarColor(name: string) {
  const sum = [...name].reduce((s, c) => s + c.charCodeAt(0), 0);
  return AVATAR_COLORS[sum % AVATAR_COLORS.length];
}

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
}

function stepIndex(status: Order["status"]) {
  if (status === "pending_confirmation") return 1;
  if (status === "confirmed") return 2;
  return 0; // disputed/cancelled — прогресс не растёт дальше первого шага
}

export function OrderChatThread({ orderId, counterpartName }: { orderId: string; counterpartName: string }) {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const [order, setOrder] = useState<Order | null>(null);
  const [delivery, setDelivery] = useState<Delivery | null | undefined>(undefined);
  const [itemImage, setItemImage] = useState<string | null>(null);
  const [messages, setMessages] = useState<OrderChatMessage[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [dispute, setDispute] = useState<Dispute | null>(null);

  const [disputeOpen, setDisputeOpen] = useState(false);
  const [disputeReason, setDisputeReason] = useState("");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [rating, setRating] = useState<1 | 2 | 3 | 4 | 5>(5);
  const [reviewText, setReviewText] = useState("");

  useEffect(() => {
    setLoading(true);
    getOrderById(orderId)
      .then((ord) => {
        setOrder(ord);
        const firstItem = ord?.items[0];
        if (firstItem?.productId) {
          getProductById(firstItem.productId)
            .then((p) => setItemImage(p?.image ?? null))
            .catch(() => setItemImage(null));
        }
      })
      .finally(() => setLoading(false));

    // Живая подписка — новые сообщения появляются сами, без перезагрузки страницы.
    const unsub = subscribeOrderChat(orderId, (chat) => setMessages(chat?.messages ?? []));
    // И на саму заявку выдачи — чтобы знать, можно ли показывать "Подтвердить получение"
    // (при способе "через бота" это разрешено только после того, как бот реально выдал предмет).
    const unsubDelivery = subscribeDelivery(orderId, setDelivery);
    return () => {
      unsub();
      unsubDelivery();
    };
  }, [orderId]);

  useEffect(() => {
    if (order?.status === "disputed") getDispute(order.id).then(setDispute).catch(() => {});
  }, [order?.status, order?.id]);

  const isBuyer = !!(user && order && order.userId === user.uid);
  const isSeller = !!(user && order && order.sellerId === user.uid);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || !user || !order) return;
    const value = text.trim();
    setText("");
    const from: OrderChatMessage["from"] = isBuyer ? "buyer" : "seller";
    try {
      await sendOrderChatMessage(orderId, order.userId, order.sellerId, from, value);
    } catch {
      toast("error", "Не удалось отправить сообщение");
    }
  }

  async function handleConfirm() {
    if (!order) return;
    setBusy(true);
    try {
      await confirmOrderReceipt(order, profile?.displayName ?? "Покупатель");
      setOrder({ ...order, status: "confirmed" });
      toast("success", "Получение подтверждено! Теперь можно оставить отзыв продавцу.");
    } catch (err: any) {
      toast("error", err?.code === "permission-denied" ? "Нет прав на это действие" : "Не удалось подтвердить");
    } finally {
      setBusy(false);
    }
  }

  async function handleDispute(e: React.FormEvent) {
    e.preventDefault();
    if (!order || !disputeReason.trim()) return;
    setBusy(true);
    try {
      await createDispute({
        orderId: order.id,
        buyerId: order.userId,
        buyerName: profile?.displayName ?? "Покупатель",
        sellerId: order.sellerId,
        reason: disputeReason.trim(),
        filedBy: "buyer",
      });
      setOrder({ ...order, status: "disputed" });
      setDisputeOpen(false);
      toast("success", "Жалоба отправлена администратору");
    } catch {
      toast("error", "Не удалось отправить жалобу");
    } finally {
      setBusy(false);
    }
  }

  async function handleCancel() {
    if (!order) return;
    if (!confirm("Отменить продажу? Деньги вернутся покупателю, товар — на склад.")) return;
    setBusy(true);
    try {
      await cancelOrderBySeller(order.id);
      setOrder({ ...order, status: "cancelled" });
      toast("success", "Заказ отменён");
    } catch (err: any) {
      toast("error", err?.message || "Не удалось отменить заказ");
    } finally {
      setBusy(false);
    }
  }

  async function handleReview(e: React.FormEvent) {
    e.preventDefault();
    if (!order) return;
    setBusy(true);
    try {
      await createReview({
        orderId: order.id,
        productId: order.items[0]?.productId ?? "",
        productName: order.items[0]?.name ?? "Товар",
        sellerId: order.sellerId,
        buyerId: order.userId,
        buyerName: profile?.displayName ?? "Покупатель",
        rating,
        text: reviewText.trim(),
      });
      setOrder({ ...order, reviewSubmitted: true });
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

  if (loading) return <div className="card p-6 text-center text-white/40 text-sm">Загрузка чата...</div>;

  return (
    <div>
      <div className="mb-3">
        <p className="font-bold">{counterpartName}</p>
        <p className="text-xs text-white/40">Заказ #{orderId.slice(0, 8)}</p>
      </div>

      {order && (
        <>
          <div className="card p-3 flex items-center gap-3 mb-3">
            <div className="relative w-11 h-11 rounded-btn overflow-hidden bg-black/30 shrink-0">
              {itemImage && <Image src={safeImageSrc(itemImage)} alt="" fill className="object-cover" sizes="44px" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{order.items.map((i) => i.name).join(", ")}</p>
              <p className="text-accent text-sm font-semibold">{order.total.toFixed(2)} ₽</p>
            </div>
            <span
              className="text-[10px] font-semibold px-2 py-1 rounded-md shrink-0"
              style={{ background: `${STATUS_LABEL[order.status].color}22`, color: STATUS_LABEL[order.status].color }}
            >
              {STATUS_LABEL[order.status].text}
            </span>
          </div>

          {(order.status === "pending_confirmation" || order.status === "confirmed") && (
            <div className="mb-3">
              <div className="flex items-center gap-1">
                {STEPS.map((_, i) => (
                  <div key={i} className="flex items-center flex-1 last:flex-none">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${i <= stepIndex(order.status) ? "bg-accent" : "bg-white/15"}`} />
                    {i < STEPS.length - 1 && (
                      <div className={`flex-1 h-0.5 mx-1 ${i < stepIndex(order.status) ? "bg-accent" : "bg-white/15"}`} />
                    )}
                  </div>
                ))}
              </div>
              <div className="flex justify-between mt-1">
                {STEPS.map((s) => (
                  <span key={s} className="text-[9px] text-white/30">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          {order.status === "disputed" && dispute && (
            <div className="mb-3 p-3 rounded-btn bg-red-500/5 border border-red-500/20 text-sm">
              <p className="text-red-400 font-medium mb-1">Жалоба: {dispute.reason}</p>
              <p className="text-white/40 text-xs">
                Статус: {dispute.status === "open" ? "рассматривается администратором" : dispute.status === "approved" ? "одобрена" : "отклонена"}
              </p>
            </div>
          )}
        </>
      )}

      {order && order.status === "pending_confirmation" && <DeliveryPanel orderId={orderId} isBuyer={isBuyer} isSeller={isSeller} />}

      <div className="space-y-2 max-h-[340px] overflow-y-auto mb-3">
        {messages.length === 0 ? (
          <p className="text-sm text-white/30 text-center py-8">Сообщений пока нет. Напишите первым.</p>
        ) : (
          messages.map((m, i) =>
            m.from === "system" ? (
              <p key={i} className="text-xs text-center text-white/40 italic py-1">
                {m.text}
              </p>
            ) : (
              (() => {
                const isMine = user && order && ((isBuyer && m.from === "buyer") || (isSeller && m.from === "seller"));
                return (
                  <div key={i} className={`flex items-end gap-2 ${isMine ? "justify-end" : "justify-start"}`}>
                    {!isMine && (
                      <div
                        className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-[10px] font-semibold"
                        style={{ background: `${avatarColor(m.from === "admin" ? "Админ" : counterpartName)}22`, color: avatarColor(m.from === "admin" ? "Админ" : counterpartName) }}
                      >
                        {initials(m.from === "admin" ? "Админ" : counterpartName)}
                      </div>
                    )}
                    <div
                      className={`max-w-[75%] px-3 py-2 text-sm ${
                        isMine
                          ? "bg-accent text-black rounded-2xl rounded-br-sm"
                          : "bg-surface text-white/80 rounded-2xl rounded-bl-sm"
                      }`}
                    >
                      {!isMine && <p className="text-[10px] text-white/30 mb-0.5">{m.from === "admin" ? "Админ" : counterpartName}</p>}
                      {m.text}
                    </div>
                  </div>
                );
              })()
            )
          )
        )}
      </div>

      {order && (
        <div className="flex flex-wrap gap-2 mb-3">
          {isBuyer && order.status === "pending_confirmation" && (
            <>
              {/* Способ "сам" (или заявка ещё не существует — старые заказы до этой фичи) — кнопка
                  доступна сразу, как раньше. Способ "через бота" — сначала нужно пройти весь флоу
                  DeliveryPanel (ник → передача боту → админ подтверждает receive/deliver), кнопка
                  подтверждения появляется только когда админ отметит delivery.status === "delivered". */}
              {(delivery?.method !== "bot" || delivery?.status === "delivered") && (
                <button onClick={handleConfirm} disabled={busy} className="btn-primary px-4 py-2 text-xs flex items-center gap-1.5 disabled:opacity-50">
                  <CheckCircle2 size={14} /> Подтвердить получение
                </button>
              )}
              <button onClick={() => setDisputeOpen((v) => !v)} className="btn-secondary px-4 py-2 text-xs flex items-center gap-1.5">
                <AlertTriangle size={14} /> Открыть спор
              </button>
            </>
          )}
          {isBuyer && order.status === "confirmed" && !order.reviewSubmitted && (
            <button onClick={() => setReviewOpen((v) => !v)} className="btn-secondary px-4 py-2 text-xs flex items-center gap-1.5">
              <Star size={14} /> Оставить отзыв
            </button>
          )}
          {isSeller && order.status === "pending_confirmation" && (
            <button onClick={handleCancel} disabled={busy} className="btn-secondary px-4 py-2 text-xs flex items-center gap-1.5 text-red-400 disabled:opacity-50">
              <XCircle size={14} /> Отменить продажу
            </button>
          )}
        </div>
      )}

      {disputeOpen && (
        <form onSubmit={handleDispute} className="space-y-2 mb-3">
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
        <form onSubmit={handleReview} className="space-y-2 mb-3">
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

      <form onSubmit={handleSend} className="flex gap-2">
        <input
          autoComplete="off"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Написать сообщение..."
          className="input-field py-2.5 text-sm flex-1"
        />
        <button className="btn-primary px-4">
          <Send size={16} />
        </button>
      </form>
    </div>
  );
}
