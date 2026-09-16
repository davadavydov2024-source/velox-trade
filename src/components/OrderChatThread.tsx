"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  Send,
  CheckCircle2,
  AlertTriangle,
  Star,
  XCircle,
  ImagePlus,
  X,
  Loader2,
  ShieldCheck,
  Terminal,
} from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { useToast } from "@/lib/toastContext";
import { subscribeOrderChat, sendOrderChatMessage } from "@/lib/orderChats";
import { getOrderById, confirmOrderReceipt, cancelOrderBySeller, getUserProfile, isAdminUid } from "@/lib/users";
import { getProductById } from "@/lib/products";
import { createDispute, getDispute, resolveDispute } from "@/lib/disputes";
import { createReview } from "@/lib/reviews";
import { OrderChatMessage, Order, Dispute } from "@/types";
import { safeImageSrc } from "@/lib/safeImage";
import { uploadImage, ImageUploadError } from "@/lib/storage";
import { auth } from "@/lib/firebase";
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

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

/** Админские слэш-команды в чате заказа — единственный способ для админа выполнять действия
 * (решить спор, вернуть деньги, предупредить) прямо из переписки, не переключаясь на отдельные
 * страницы /admin/disputes и /admin/users. Видны только когда чат открыт в режиме админа. */
const ADMIN_COMMANDS = [
  { cmd: "/approve", hint: "одобрить открытый спор (без возврата денег)" },
  { cmd: "/reject", hint: "отклонить открытый спор" },
  { cmd: "/refund", hint: "вернуть деньги покупателю и отменить заказ [причина]" },
  { cmd: "/warn", hint: "отправить официальное предупреждение <текст>" },
  { cmd: "/help", hint: "показать список команд" },
] as const;

export function OrderChatThread({
  orderId,
  counterpartName,
  asAdmin = false,
}: {
  orderId: string;
  counterpartName: string;
  /** Открыть чат в режиме модерации — доступно только со страниц /admin/*. В этом режиме под
   * каждым сообщением подписан конкретный отправитель (покупатель/продавец по имени), а не общий
   * "counterpartName", и в поле ввода работают слэш-команды (см. ADMIN_COMMANDS). */
  asAdmin?: boolean;
}) {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const [order, setOrder] = useState<Order | null>(null);
  const [itemImage, setItemImage] = useState<string | null>(null);
  const [messages, setMessages] = useState<OrderChatMessage[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [dispute, setDispute] = useState<Dispute | null>(null);
  const [buyerName, setBuyerName] = useState("Покупатель");
  const [sellerName, setSellerName] = useState("Продавец");
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

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
        if (asAdmin && ord) {
          getUserProfile(ord.userId).then((p) => p && setBuyerName(p.displayName)).catch(() => {});
          getUserProfile(ord.sellerId).then((p) => p && setSellerName(p.displayName)).catch(() => {});
        }
      })
      .finally(() => setLoading(false));

    // Живая подписка — новые сообщения появляются сами, без перезагрузки страницы.
    const unsub = subscribeOrderChat(orderId, (chat) => setMessages(chat?.messages ?? []));
    return unsub;
  }, [orderId, asAdmin]);

  useEffect(() => {
    if (order?.status === "disputed") getDispute(order.id).then(setDispute).catch(() => {});
  }, [order?.status, order?.id]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  const isBuyer = !asAdmin && !!(user && order && order.userId === user.uid);
  const isSeller = !asAdmin && !!(user && order && order.sellerId === user.uid);
  const isAdminViewer = asAdmin && isAdminUid(user?.uid);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const value = text.trim();
    if (!value || !user || !order) return;

    if (isAdminViewer && value.startsWith("/")) {
      await runAdminCommand(value);
      setText("");
      return;
    }

    setText("");
    const from: OrderChatMessage["from"] = isAdminViewer ? "admin" : isBuyer ? "buyer" : "seller";
    try {
      await sendOrderChatMessage(orderId, order.userId, order.sellerId, from, value);
    } catch {
      toast("error", "Не удалось отправить сообщение");
      setText(value);
    }
  }

  async function runAdminCommand(raw: string) {
    if (!order) return;
    const [cmd, ...rest] = raw.trim().split(/\s+/);
    const arg = rest.join(" ").trim();

    if (cmd === "/help") {
      toast("info", "Команды: " + ADMIN_COMMANDS.map((c) => c.cmd).join(", ") + " — начни печатать «/», чтобы увидеть подсказки под полем ввода.");
      return;
    }

    setBusy(true);
    try {
      if (cmd === "/approve" || cmd === "/reject") {
        const d = dispute ?? (await getDispute(order.id));
        if (!d || d.status !== "open") {
          toast("warning", "По этому заказу нет открытого спора");
          return;
        }
        await resolveDispute(order.id, cmd === "/approve");
        await sendOrderChatMessage(
          orderId,
          order.userId,
          order.sellerId,
          "system",
          cmd === "/approve" ? "✅ Администратор одобрил спор." : "❌ Администратор отклонил спор."
        );
        setDispute({ ...d, status: cmd === "/approve" ? "approved" : "rejected" });
        toast("success", cmd === "/approve" ? "Спор одобрен" : "Спор отклонён");
      } else if (cmd === "/refund") {
        if (!confirm(`Вернуть ${order.total} ₽ покупателю и отменить заказ?`)) return;
        const idToken = await auth.currentUser?.getIdToken();
        const res = await fetch("/api/admin/orders/refund", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
          body: JSON.stringify({ orderId: order.id, reason: arg || undefined }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setOrder({ ...order, status: "cancelled" });
        toast("success", "Деньги возвращены покупателю");
      } else if (cmd === "/warn") {
        if (!arg) {
          toast("warning", "Напиши текст предупреждения после команды, например: /warn не груби продавцу");
          return;
        }
        await sendOrderChatMessage(orderId, order.userId, order.sellerId, "admin", `⚠️ Предупреждение от администрации: ${arg}`);
      } else {
        toast("warning", `Неизвестная команда ${cmd}. Введи /help, чтобы увидеть список.`);
      }
    } catch (err: any) {
      toast("error", err?.message || "Не удалось выполнить команду");
    } finally {
      setBusy(false);
    }
  }

  async function handlePhotoPick(file: File | undefined) {
    if (!file || !user || !order) return;
    setUploadingPhoto(true);
    try {
      const url = await uploadImage(file, "chat-photos");
      const from: OrderChatMessage["from"] = isAdminViewer ? "admin" : isBuyer ? "buyer" : "seller";
      await sendOrderChatMessage(orderId, order.userId, order.sellerId, from, "", url);
    } catch (err) {
      toast("error", err instanceof ImageUploadError ? err.message : "Не удалось отправить фото");
    } finally {
      setUploadingPhoto(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
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

  if (loading) {
    return (
      <div className="p-6 space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className={`flex ${i % 2 ? "justify-end" : "justify-start"}`}>
            <div className="h-9 w-40 rounded-2xl bg-white/5 animate-pulse" />
          </div>
        ))}
      </div>
    );
  }

  const showCommandHints = isAdminViewer && text.startsWith("/");
  const matchingCommands = showCommandHints ? ADMIN_COMMANDS.filter((c) => c.cmd.startsWith(text.split(" ")[0])) : [];

  return (
    <div className="flex flex-col h-full">
      {lightbox && (
        <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
          <button className="absolute top-4 right-4 text-white/70 hover:text-white" onClick={() => setLightbox(null)}>
            <X size={26} />
          </button>
          <img src={safeImageSrc(lightbox)} alt="" className="max-w-full max-h-full rounded-lg object-contain" />
        </div>
      )}

      <div className="shrink-0">
      <div className="flex items-center gap-2 mb-3">
        <div>
          <p className="font-bold flex items-center gap-1.5">
            {counterpartName}
            {isAdminViewer && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-accent/15 text-accent flex items-center gap-1">
                <ShieldCheck size={11} /> Режим админа
              </span>
            )}
          </p>
          <p className="text-xs text-white/40">Заказ #{orderId.slice(0, 8)}</p>
        </div>
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
      </div>

      <div ref={scrollRef} className="flex-1 min-h-0 space-y-1 overflow-y-auto mb-3 pr-1 -mr-1 overscroll-contain">
        {messages.length === 0 ? (
          <p className="text-sm text-white/30 text-center py-8">Сообщений пока нет. Напишите первым.</p>
        ) : (
          messages.map((m, i) => {
            if (m.from === "system") {
              return (
                <p key={i} className="text-xs text-center text-white/40 italic py-1.5">
                  {m.text}
                </p>
              );
            }

            const isMine = isAdminViewer ? m.from === "admin" : (isBuyer && m.from === "buyer") || (isSeller && m.from === "seller");
            const senderLabel = m.from === "admin" ? "Админ" : asAdmin ? (m.from === "buyer" ? buyerName : sellerName) : counterpartName;
            const prevSameSender = i > 0 && messages[i - 1].from === m.from;
            const isWarning = m.from === "admin" && m.text.startsWith("⚠️ Предупреждение");

            return (
              <div key={i} className={`flex items-end gap-2 ${isMine ? "justify-end" : "justify-start"} ${prevSameSender ? "mt-0.5" : "mt-2.5"}`}>
                {!isMine && !prevSameSender && (
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-[10px] font-semibold"
                    style={{ background: `${avatarColor(senderLabel)}22`, color: avatarColor(senderLabel) }}
                  >
                    {initials(senderLabel)}
                  </div>
                )}
                {!isMine && prevSameSender && <div className="w-7 shrink-0" />}

                <div
                  className={`max-w-[85%] sm:max-w-[75%] group shadow-sm ${
                    isWarning
                      ? "bg-amber-500/15 border border-amber-500/30 text-amber-200"
                      : isMine
                      ? "bg-gradient-to-br from-accent to-accent-dark text-black"
                      : "bg-surface border border-white/[0.04] text-white/80"
                  } ${m.imageUrl ? "p-1.5" : "px-3.5 py-2.5"} text-[13.5px] leading-snug rounded-2xl ${isMine ? "rounded-br-md" : "rounded-bl-md"}`}
                >
                  {!isMine && !prevSameSender && (
                    <p className={`text-[10px] mb-0.5 ${m.imageUrl ? "px-1.5 pt-1" : ""} text-white/30`}>{senderLabel}</p>
                  )}
                  {m.imageUrl && (
                    <button type="button" onClick={() => setLightbox(m.imageUrl!)} className="block">
                      <Image
                        src={safeImageSrc(m.imageUrl)}
                        alt=""
                        width={220}
                        height={220}
                        className="rounded-xl object-cover max-h-[220px] w-auto max-w-full"
                      />
                    </button>
                  )}
                  {m.text && <p className={m.imageUrl ? "px-1.5 pt-1.5" : ""}>{m.text}</p>}
                  <p className={`text-[9px] opacity-50 text-right ${m.imageUrl ? "px-1.5 pb-0.5" : "mt-0.5"}`}>{formatTime(m.createdAt)}</p>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="shrink-0">
      {order && (
        <div className="flex flex-wrap gap-2 mb-3">
          {isBuyer && order.status === "pending_confirmation" && (
            <>
              <button onClick={handleConfirm} disabled={busy} className="btn-primary px-4 py-2 text-xs flex items-center gap-1.5 disabled:opacity-50">
                <CheckCircle2 size={14} /> Подтвердить получение
              </button>
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
          {isAdminViewer && order.status === "disputed" && dispute?.status === "open" && (
            <>
              <button onClick={() => runAdminCommand("/approve")} disabled={busy} className="btn-secondary px-4 py-2 text-xs flex items-center gap-1.5 text-green-400 disabled:opacity-50">
                <CheckCircle2 size={14} /> Одобрить спор
              </button>
              <button onClick={() => runAdminCommand("/reject")} disabled={busy} className="btn-secondary px-4 py-2 text-xs flex items-center gap-1.5 text-red-400 disabled:opacity-50">
                <XCircle size={14} /> Отклонить спор
              </button>
            </>
          )}
          {isAdminViewer && (order.status === "pending_confirmation" || order.status === "disputed") && (
            <button onClick={() => runAdminCommand("/refund")} disabled={busy} className="btn-secondary px-4 py-2 text-xs flex items-center gap-1.5 text-amber-400 disabled:opacity-50">
              <Terminal size={14} /> Вернуть деньги
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

      <div className="relative">
        {matchingCommands.length > 0 && (
          <div className="absolute bottom-full mb-1.5 left-0 right-0 card p-1.5 space-y-0.5 z-10">
            {matchingCommands.map((c) => (
              <button
                key={c.cmd}
                type="button"
                onClick={() => setText(`${c.cmd} `)}
                className="w-full text-left px-2.5 py-1.5 rounded-md hover:bg-white/5 text-xs flex items-center gap-2"
              >
                <span className="font-mono text-accent">{c.cmd}</span>
                <span className="text-white/40">{c.hint}</span>
              </button>
            ))}
          </div>
        )}

        <form onSubmit={handleSend} className="flex gap-2 items-end" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
          <input
            autoComplete="off"
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => handlePhotoPick(e.target.files?.[0])}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingPhoto}
            title="Отправить фото"
            className="btn-secondary px-3 py-2.5 shrink-0 disabled:opacity-50"
          >
            {uploadingPhoto ? <Loader2 size={16} className="animate-spin" /> : <ImagePlus size={16} />}
          </button>
          <input
            autoComplete="off"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={isAdminViewer ? "Сообщение или команда (/help)..." : "Написать сообщение..."}
            className="input-field py-2.5 text-sm flex-1 rounded-full"
          />
          <button className="btn-primary w-10 h-10 shrink-0 rounded-full flex items-center justify-center p-0">
            <Send size={16} />
          </button>
        </form>
      </div>
      </div>
    </div>
  );
}
