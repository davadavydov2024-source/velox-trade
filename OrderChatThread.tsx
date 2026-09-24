"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import {
  Send,
  Star,
  XCircle,
  ChevronRight,
  X,
  CheckCircle2,
  AlertTriangle,
  User,
  Package,
  ShieldCheck,
} from "lucide-react";
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

// ============================================================================
// Таймлайн сделки (раньше был отдельным файлом components/OrderDealTimeline.tsx —
// объединён сюда же, чтобы весь функционал жил в одном файле и не терялся при
// переносе изменений в проект).
// ============================================================================
type StepState = "done" | "current" | "pending" | "dashed";

function TimelineDot({ state, icon }: { state: StepState; icon: React.ReactNode }) {
  const base = "w-7 h-7 rounded-full flex items-center justify-center shrink-0 border-2";
  if (state === "done") return <div className={`${base} border-accent bg-accent/15 text-accent`}>{icon}</div>;
  if (state === "current")
    return <div className={`${base} border-accent bg-accent text-black shadow-[0_0_0_4px_rgba(255,152,0,0.16)]`}>{icon}</div>;
  if (state === "dashed") return <div className={`${base} border-dashed border-red-400/40 text-red-300/80`}>{icon}</div>;
  return <div className={`${base} border-border bg-surface text-white/30`}>{icon}</div>;
}

function TimelineLine({ done }: { done: boolean }) {
  return <div className={`w-0.5 flex-1 my-0.5 min-h-[22px] ${done ? "bg-accent" : "bg-border"}`} />;
}

/**
 * Наглядный вертикальный таймлайн сделки: покупка -> обязательный игровой ник -> выдача (через
 * бота-посредника или напрямую от продавца) -> опциональный спор -> подтверждение получения.
 * Ник — отдельный, всегда обязательный шаг независимо от того, есть ли для игры бот-посредник
 * (см. фикс в api/deliveries/submit-nickname).
 */
function OrderDealTimeline({ order, delivery }: { order: Order; delivery: Delivery | null | undefined }) {
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
          <TimelineDot state="done" icon={<CheckCircle2 size={14} />} />
          <TimelineLine done />
        </div>
        <div className="pb-4 pt-0.5">
          <p className="text-sm font-medium">Товар куплен</p>
          <p className="text-xs text-white/40">Оплата списана с баланса, продавец уведомлён</p>
        </div>
      </div>

      <div className="flex gap-3">
        <div className="flex flex-col items-center">
          <TimelineDot state={nicknameState} icon={<User size={13} />} />
          <TimelineLine done={nicknameDone} />
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
          <TimelineDot state={deliveryState} icon={<Package size={13} />} />
          <TimelineLine done={deliveryDone} />
        </div>
        <div className="pb-4 pt-0.5">
          <p className={`text-sm font-medium ${deliveryState === "pending" ? "text-white/60" : ""}`}>Выдача предмета</p>
          <p className="text-xs text-white/40">{deliveryHint}</p>
        </div>
      </div>

      <div className="flex gap-3">
        <div className="flex flex-col items-center">
          <TimelineDot state={disputeState} icon={<AlertTriangle size={12} />} />
          <TimelineLine done={false} />
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
          <TimelineDot state={confirmState} icon={<ShieldCheck size={13} />} />
        </div>
        <div className="pt-0.5">
          <p className={`text-sm font-medium ${confirmState === "pending" ? "text-white/60" : ""}`}>Подтверждение получения</p>
          <p className="text-xs text-white/40">Сделка закроется, продавцу перейдут средства</p>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Модалка сделки (раньше был отдельным файлом components/DealSheet.tsx — тоже
// объединена сюда).
// ============================================================================
function DealSheet({
  open,
  onClose,
  order,
  itemImage,
  delivery,
  isBuyer,
  isSeller,
  busy,
  canConfirm,
  onConfirm,
  onOpenDispute,
}: {
  open: boolean;
  onClose: () => void;
  order: Order;
  itemImage: string | null;
  delivery: Delivery | null | undefined;
  isBuyer: boolean;
  isSeller: boolean;
  busy: boolean;
  canConfirm: boolean;
  onConfirm: () => void;
  onOpenDispute: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />

      <div
        className="relative w-full sm:max-w-md sm:mx-4 bg-surface border border-border rounded-t-2xl sm:rounded-2xl max-h-[88vh] overflow-y-auto"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex justify-center pt-2.5 pb-1 sm:hidden sticky top-0 bg-surface">
          <span className="w-9 h-1 rounded-full bg-white/15" />
        </div>

        <div className="p-5">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="min-w-0">
              <p className="font-bold text-lg leading-tight truncate">{order.items.map((i) => i.name).join(", ")}</p>
              <p className="text-xs text-white/40 mt-0.5">Заказ #{order.id.slice(0, 8)}</p>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center text-white/50 hover:bg-white/5 hover:text-white shrink-0 transition-colors"
            >
              <X size={16} />
            </button>
          </div>

          <div className="relative w-full aspect-[4/3] rounded-xl bg-black/30 mb-2 overflow-hidden">
            {itemImage && <Image src={safeImageSrc(itemImage)} alt="" fill className="object-contain p-6" sizes="420px" />}
          </div>
          <div className="flex items-center justify-between mb-6">
            <span className="text-xs text-white/40">Количество: {order.items.reduce((s, i) => s + i.quantity, 0)}</span>
            <span className="font-bold text-accent">{order.total.toFixed(2)} ₽</span>
          </div>

          <OrderDealTimeline order={order} delivery={delivery} />

          {order.status === "pending_confirmation" && <DeliveryPanel orderId={order.id} isBuyer={isBuyer} isSeller={isSeller} />}

          {isBuyer && order.status === "pending_confirmation" && (
            <div className="flex gap-2.5 mt-4">
              <button
                onClick={onOpenDispute}
                className="flex-1 py-3 rounded-xl text-sm font-semibold border border-red-400/25 bg-red-400/[0.08] text-red-300 hover:bg-red-400/[0.14] transition-colors flex items-center justify-center gap-1.5"
              >
                <AlertTriangle size={14} /> Открыть спор
              </button>
              <button
                onClick={onConfirm}
                disabled={busy || !canConfirm}
                title={!canConfirm ? "Сначала укажи игровой ник — это обязательно" : undefined}
                className="btn-primary flex-1 py-3 rounded-xl text-sm flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <CheckCircle2 size={14} /> Подтвердить получение
              </button>
            </div>
          )}
          {isBuyer && order.status === "pending_confirmation" && !canConfirm && (
            <p className="text-[11px] text-white/35 text-center mt-2">
              Подтверждение получения станет доступно после того, как ты укажешь игровой ник выше.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Основной компонент чата заказа
// ============================================================================
export function OrderChatThread({ orderId, counterpartName }: { orderId: string; counterpartName: string }) {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const [order, setOrder] = useState<Order | null>(null);
  const [itemImage, setItemImage] = useState<string | null>(null);
  const [messages, setMessages] = useState<OrderChatMessage[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [dispute, setDispute] = useState<Dispute | null>(null);
  const [delivery, setDelivery] = useState<Delivery | null | undefined>(undefined);
  const [dealOpen, setDealOpen] = useState(false);

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
    // Живая подписка на выдачу — нужна, чтобы знать, указан ли уже обязательный игровой ник,
    // и не давать подтвердить получение до этого шага.
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

  // Ник обязателен ВСЕГДА перед подтверждением получения — и когда для игры подключён
  // бот-посредник, и когда продавец передаёт предмет напрямую. Пока delivery ещё грузится
  // (undefined), временно разрешаем — иначе кнопка на долю секунды мигнёт задизейбленной.
  const canConfirm = delivery === undefined || !!delivery?.buyerNickname;

  async function handleConfirm() {
    if (!order || !canConfirm) return;
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
          {/* Клик по товару открывает карточку сделки: фото, статус и весь таймлайн шагов —
              включая обязательный игровой ник — в одном месте, а не размазанным по чату. */}
          <button
            onClick={() => setDealOpen(true)}
            className="w-full card p-3 flex items-center gap-3 mb-3 text-left transition-colors hover:bg-white/[0.03] active:scale-[0.99]"
          >
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
            <ChevronRight size={15} className="text-white/25 shrink-0" />
          </button>

          {order.status === "disputed" && dispute && (
            <div className="mb-3 p-3 rounded-btn bg-red-500/5 border border-red-500/20 text-sm">
              <p className="text-red-400 font-medium mb-1">Жалоба: {dispute.reason}</p>
              <p className="text-white/40 text-xs">
                Статус:{" "}
                {dispute.status === "open" ? "рассматривается администратором" : dispute.status === "approved" ? "одобрена" : "отклонена"}
              </p>
            </div>
          )}

          <DealSheet
            open={dealOpen}
            onClose={() => setDealOpen(false)}
            order={order}
            itemImage={itemImage}
            delivery={delivery}
            isBuyer={isBuyer}
            isSeller={isSeller}
            busy={busy}
            canConfirm={canConfirm}
            onConfirm={handleConfirm}
            onOpenDispute={() => {
              setDealOpen(false);
              setDisputeOpen(true);
            }}
          />
        </>
      )}

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
                        style={{
                          background: `${avatarColor(m.from === "admin" ? "Админ" : counterpartName)}22`,
                          color: avatarColor(m.from === "admin" ? "Админ" : counterpartName),
                        }}
                      >
                        {initials(m.from === "admin" ? "Админ" : counterpartName)}
                      </div>
                    )}
                    <div
                      className={`max-w-[75%] px-3 py-2 text-sm ${
                        isMine ? "bg-accent text-black rounded-2xl rounded-br-sm" : "bg-surface text-white/80 rounded-2xl rounded-bl-sm"
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
        <button type="submit" className="btn-primary px-4">
          <Send size={16} />
        </button>
      </form>
    </div>
  );
}
