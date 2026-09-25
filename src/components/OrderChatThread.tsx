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
  pending_confirmation: { text: "РћР¶РёРґР°РµС‚ РїРѕРґС‚РІРµСЂР¶РґРµРЅРёСЏ", color: "#ff9800" },
  confirmed: { text: "Р—Р°РІРµСЂС€С‘РЅ", color: "#4caf50" },
  disputed: { text: "РЎРїРѕСЂ", color: "#f44336" },
  cancelled: { text: "РћС‚РјРµРЅС‘РЅ", color: "#9aa3b2" },
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
// РўР°Р№РјР»Р°Р№РЅ СЃРґРµР»РєРё (СЂР°РЅСЊС€Рµ Р±С‹Р» РѕС‚РґРµР»СЊРЅС‹Рј С„Р°Р№Р»РѕРј components/OrderDealTimeline.tsx вЂ”
// РѕР±СЉРµРґРёРЅС‘РЅ СЃСЋРґР° Р¶Рµ, С‡С‚РѕР±С‹ РІРµСЃСЊ С„СѓРЅРєС†РёРѕРЅР°Р» Р¶РёР» РІ РѕРґРЅРѕРј С„Р°Р№Р»Рµ Рё РЅРµ С‚РµСЂСЏР»СЃСЏ РїСЂРё
// РїРµСЂРµРЅРѕСЃРµ РёР·РјРµРЅРµРЅРёР№ РІ РїСЂРѕРµРєС‚).
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
 * РќР°РіР»СЏРґРЅС‹Р№ РІРµСЂС‚РёРєР°Р»СЊРЅС‹Р№ С‚Р°Р№РјР»Р°Р№РЅ СЃРґРµР»РєРё: РїРѕРєСѓРїРєР° -> РѕР±СЏР·Р°С‚РµР»СЊРЅС‹Р№ РёРіСЂРѕРІРѕР№ РЅРёРє -> РІС‹РґР°С‡Р° (С‡РµСЂРµР·
 * Р±РѕС‚Р°-РїРѕСЃСЂРµРґРЅРёРєР° РёР»Рё РЅР°РїСЂСЏРјСѓСЋ РѕС‚ РїСЂРѕРґР°РІС†Р°) -> РѕРїС†РёРѕРЅР°Р»СЊРЅС‹Р№ СЃРїРѕСЂ -> РїРѕРґС‚РІРµСЂР¶РґРµРЅРёРµ РїРѕР»СѓС‡РµРЅРёСЏ.
 * РќРёРє вЂ” РѕС‚РґРµР»СЊРЅС‹Р№, РІСЃРµРіРґР° РѕР±СЏР·Р°С‚РµР»СЊРЅС‹Р№ С€Р°Рі РЅРµР·Р°РІРёСЃРёРјРѕ РѕС‚ С‚РѕРіРѕ, РµСЃС‚СЊ Р»Рё РґР»СЏ РёРіСЂС‹ Р±РѕС‚-РїРѕСЃСЂРµРґРЅРёРє
 * (СЃРј. С„РёРєСЃ РІ api/deliveries/submit-nickname).
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
    ? "Р–РґС‘С‚ Р·Р°РїСѓСЃРєР° РІС‹РґР°С‡Рё"
    : delivery.botNickname
    ? `Р§РµСЂРµР· Р±РѕС‚Р°-РїРѕСЃСЂРµРґРЅРёРєР° ${delivery.botNickname}`
    : delivery.buyerNickname
    ? "РќР°РїСЂСЏРјСѓСЋ РѕС‚ РїСЂРѕРґР°РІС†Р° вЂ” Р±РѕС‚-РїРѕСЃСЂРµРґРЅРёРє РґР»СЏ СЌС‚РѕР№ РёРіСЂС‹ РЅРµ РїРѕРґРєР»СЋС‡С‘РЅ"
    : "РџРѕСЏРІРёС‚СЃСЏ СЃСЂР°Р·Сѓ РїРѕСЃР»Рµ С‚РѕРіРѕ, РєР°Рє С‚С‹ СѓРєР°Р¶РµС€СЊ РёРіСЂРѕРІРѕР№ РЅРёРє";

  return (
    <div>
      <div className="flex gap-3">
        <div className="flex flex-col items-center">
          <TimelineDot state="done" icon={<CheckCircle2 size={14} />} />
          <TimelineLine done />
        </div>
        <div className="pb-4 pt-0.5">
          <p className="text-sm font-medium">РўРѕРІР°СЂ РєСѓРїР»РµРЅ</p>
          <p className="text-xs text-white/40">РћРїР»Р°С‚Р° СЃРїРёСЃР°РЅР° СЃ Р±Р°Р»Р°РЅСЃР°, РїСЂРѕРґР°РІРµС† СѓРІРµРґРѕРјР»С‘РЅ</p>
        </div>
      </div>

      <div className="flex gap-3">
        <div className="flex flex-col items-center">
          <TimelineDot state={nicknameState} icon={<User size={13} />} />
          <TimelineLine done={nicknameDone} />
        </div>
        <div className="pb-4 pt-0.5">
          <p className={`text-sm font-medium ${nicknameState === "pending" ? "text-white/60" : ""}`}>РРіСЂРѕРІРѕР№ РЅРёРє</p>
          <p className="text-xs text-white/40">
            {nicknameDone
              ? `РЈРєР°Р·Р°РЅ: ${delivery?.buyerNickname}`
              : "РћР±СЏР·Р°С‚РµР»СЊРЅРѕ РІ Р»СЋР±РѕРј СЃР»СѓС‡Р°Рµ вЂ” Рё РґР»СЏ РІС‹РґР°С‡Рё С‡РµСЂРµР· Р±РѕС‚Р°, Рё РЅР°РїСЂСЏРјСѓСЋ РѕС‚ РїСЂРѕРґР°РІС†Р°"}
          </p>
        </div>
      </div>

      <div className="flex gap-3">
        <div className="flex flex-col items-center">
          <TimelineDot state={deliveryState} icon={<Package size={13} />} />
          <TimelineLine done={deliveryDone} />
        </div>
        <div className="pb-4 pt-0.5">
          <p className={`text-sm font-medium ${deliveryState === "pending" ? "text-white/60" : ""}`}>Р’С‹РґР°С‡Р° РїСЂРµРґРјРµС‚Р°</p>
          <p className="text-xs text-white/40">{deliveryHint}</p>
        </div>
      </div>

      <div className="flex gap-3">
        <div className="flex flex-col items-center">
          <TimelineDot state={disputeState} icon={<AlertTriangle size={12} />} />
          <TimelineLine done={false} />
        </div>
        <div className="pb-4 pt-0.5">
          <p className={`text-sm font-medium ${disputed ? "text-red-300" : "text-white/60"}`}>РЎРїРѕСЂ</p>
          <p className="text-xs text-white/40">
            {disputed ? "РћС‚РєСЂС‹С‚ вЂ” РїРѕРґРєР»СЋС‡РёР»СЃСЏ Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂ" : "РќРµРѕР±СЏР·Р°С‚РµР»СЊРЅС‹Р№ С€Р°Рі: РµСЃР»Рё С‡С‚Рѕ-С‚Рѕ РїРѕС€Р»Рѕ РЅРµ С‚Р°Рє"}
          </p>
        </div>
      </div>

      <div className="flex gap-3">
        <div className="flex flex-col items-center">
          <TimelineDot state={confirmState} icon={<ShieldCheck size={13} />} />
        </div>
        <div className="pt-0.5">
          <p className={`text-sm font-medium ${confirmState === "pending" ? "text-white/60" : ""}`}>РџРѕРґС‚РІРµСЂР¶РґРµРЅРёРµ РїРѕР»СѓС‡РµРЅРёСЏ</p>
          <p className="text-xs text-white/40">РЎРґРµР»РєР° Р·Р°РєСЂРѕРµС‚СЃСЏ, РїСЂРѕРґР°РІС†Сѓ РїРµСЂРµР№РґСѓС‚ СЃСЂРµРґСЃС‚РІР°</p>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// РњРѕРґР°Р»РєР° СЃРґРµР»РєРё (СЂР°РЅСЊС€Рµ Р±С‹Р» РѕС‚РґРµР»СЊРЅС‹Рј С„Р°Р№Р»РѕРј components/DealSheet.tsx вЂ” С‚РѕР¶Рµ
// РѕР±СЉРµРґРёРЅРµРЅР° СЃСЋРґР°).
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
              <p className="text-xs text-white/40 mt-0.5">Р—Р°РєР°Р· #{order.id.slice(0, 8)}</p>
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
            <span className="text-xs text-white/40">РљРѕР»РёС‡РµСЃС‚РІРѕ: {order.items.reduce((s, i) => s + i.quantity, 0)}</span>
            <span className="font-bold text-accent">{order.total.toFixed(2)} в‚Ѕ</span>
          </div>

          <OrderDealTimeline order={order} delivery={delivery} />

          {order.status === "pending_confirmation" && <DeliveryPanel orderId={order.id} isBuyer={isBuyer} isSeller={isSeller} />}

          {isBuyer && order.status === "pending_confirmation" && (
            <div className="flex gap-2.5 mt-4">
              <button
                onClick={onOpenDispute}
                className="flex-1 py-3 rounded-xl text-sm font-semibold border border-red-400/25 bg-red-400/[0.08] text-red-300 hover:bg-red-400/[0.14] transition-colors flex items-center justify-center gap-1.5"
              >
                <AlertTriangle size={14} /> РћС‚РєСЂС‹С‚СЊ СЃРїРѕСЂ
              </button>
              <button
                onClick={onConfirm}
                disabled={busy || !canConfirm}
                title={!canConfirm ? "РЎРЅР°С‡Р°Р»Р° СѓРєР°Р¶Рё РёРіСЂРѕРІРѕР№ РЅРёРє вЂ” СЌС‚Рѕ РѕР±СЏР·Р°С‚РµР»СЊРЅРѕ" : undefined}
                className="btn-primary flex-1 py-3 rounded-xl text-sm flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <CheckCircle2 size={14} /> РџРѕРґС‚РІРµСЂРґРёС‚СЊ РїРѕР»СѓС‡РµРЅРёРµ
              </button>
            </div>
          )}
          {isBuyer && order.status === "pending_confirmation" && !canConfirm && (
            <p className="text-[11px] text-white/35 text-center mt-2">
              РџРѕРґС‚РІРµСЂР¶РґРµРЅРёРµ РїРѕР»СѓС‡РµРЅРёСЏ СЃС‚Р°РЅРµС‚ РґРѕСЃС‚СѓРїРЅРѕ РїРѕСЃР»Рµ С‚РѕРіРѕ, РєР°Рє С‚С‹ СѓРєР°Р¶РµС€СЊ РёРіСЂРѕРІРѕР№ РЅРёРє РІС‹С€Рµ.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// РћСЃРЅРѕРІРЅРѕР№ РєРѕРјРїРѕРЅРµРЅС‚ С‡Р°С‚Р° Р·Р°РєР°Р·Р°
// ============================================================================
export function OrderChatThread({ orderId, counterpartName, asAdmin = false }: { orderId: string; counterpartName: string; asAdmin?: boolean }) {
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

    // Р–РёРІР°СЏ РїРѕРґРїРёСЃРєР° вЂ” РЅРѕРІС‹Рµ СЃРѕРѕР±С‰РµРЅРёСЏ РїРѕСЏРІР»СЏСЋС‚СЃСЏ СЃР°РјРё, Р±РµР· РїРµСЂРµР·Р°РіСЂСѓР·РєРё СЃС‚СЂР°РЅРёС†С‹.
    const unsub = subscribeOrderChat(orderId, (chat) => setMessages(chat?.messages ?? []));
    // Р–РёРІР°СЏ РїРѕРґРїРёСЃРєР° РЅР° РІС‹РґР°С‡Сѓ вЂ” РЅСѓР¶РЅР°, С‡С‚РѕР±С‹ Р·РЅР°С‚СЊ, СѓРєР°Р·Р°РЅ Р»Рё СѓР¶Рµ РѕР±СЏР·Р°С‚РµР»СЊРЅС‹Р№ РёРіСЂРѕРІРѕР№ РЅРёРє,
    // Рё РЅРµ РґР°РІР°С‚СЊ РїРѕРґС‚РІРµСЂРґРёС‚СЊ РїРѕР»СѓС‡РµРЅРёРµ РґРѕ СЌС‚РѕРіРѕ С€Р°РіР°.
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
      toast("error", "РќРµ СѓРґР°Р»РѕСЃСЊ РѕС‚РїСЂР°РІРёС‚СЊ СЃРѕРѕР±С‰РµРЅРёРµ");
    }
  }

  // РќРёРє РѕР±СЏР·Р°С‚РµР»РµРЅ Р’РЎР•Р“Р”Рђ РїРµСЂРµРґ РїРѕРґС‚РІРµСЂР¶РґРµРЅРёРµРј РїРѕР»СѓС‡РµРЅРёСЏ вЂ” Рё РєРѕРіРґР° РґР»СЏ РёРіСЂС‹ РїРѕРґРєР»СЋС‡С‘РЅ
  // Р±РѕС‚-РїРѕСЃСЂРµРґРЅРёРє, Рё РєРѕРіРґР° РїСЂРѕРґР°РІРµС† РїРµСЂРµРґР°С‘С‚ РїСЂРµРґРјРµС‚ РЅР°РїСЂСЏРјСѓСЋ. РџРѕРєР° delivery РµС‰С‘ РіСЂСѓР·РёС‚СЃСЏ
  // (undefined), РІСЂРµРјРµРЅРЅРѕ СЂР°Р·СЂРµС€Р°РµРј вЂ” РёРЅР°С‡Рµ РєРЅРѕРїРєР° РЅР° РґРѕР»СЋ СЃРµРєСѓРЅРґС‹ РјРёРіРЅС‘С‚ Р·Р°РґРёР·РµР№Р±Р»РµРЅРЅРѕР№.
  const canConfirm = delivery === undefined || !!delivery?.buyerNickname;

  async function handleConfirm() {
    if (!order || !canConfirm) return;
    setBusy(true);
    try {
      await confirmOrderReceipt(order, profile?.displayName ?? "РџРѕРєСѓРїР°С‚РµР»СЊ");
      setOrder({ ...order, status: "confirmed" });
      toast("success", "РџРѕР»СѓС‡РµРЅРёРµ РїРѕРґС‚РІРµСЂР¶РґРµРЅРѕ! РўРµРїРµСЂСЊ РјРѕР¶РЅРѕ РѕСЃС‚Р°РІРёС‚СЊ РѕС‚Р·С‹РІ РїСЂРѕРґР°РІС†Сѓ.");
    } catch (err: any) {
      toast("error", err?.code === "permission-denied" ? "РќРµС‚ РїСЂР°РІ РЅР° СЌС‚Рѕ РґРµР№СЃС‚РІРёРµ" : "РќРµ СѓРґР°Р»РѕСЃСЊ РїРѕРґС‚РІРµСЂРґРёС‚СЊ");
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
        buyerName: profile?.displayName ?? "РџРѕРєСѓРїР°С‚РµР»СЊ",
        sellerId: order.sellerId,
        reason: disputeReason.trim(),
        filedBy: "buyer",
      });
      setOrder({ ...order, status: "disputed" });
      setDisputeOpen(false);
      toast("success", "Р–Р°Р»РѕР±Р° РѕС‚РїСЂР°РІР»РµРЅР° Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂСѓ");
    } catch {
      toast("error", "РќРµ СѓРґР°Р»РѕСЃСЊ РѕС‚РїСЂР°РІРёС‚СЊ Р¶Р°Р»РѕР±Сѓ");
    } finally {
      setBusy(false);
    }
  }

  async function handleCancel() {
    if (!order) return;
    if (!confirm("РћС‚РјРµРЅРёС‚СЊ РїСЂРѕРґР°Р¶Сѓ? Р”РµРЅСЊРіРё РІРµСЂРЅСѓС‚СЃСЏ РїРѕРєСѓРїР°С‚РµР»СЋ, С‚РѕРІР°СЂ вЂ” РЅР° СЃРєР»Р°Рґ.")) return;
    setBusy(true);
    try {
      await cancelOrderBySeller(order.id);
      setOrder({ ...order, status: "cancelled" });
      toast("success", "Р—Р°РєР°Р· РѕС‚РјРµРЅС‘РЅ");
    } catch (err: any) {
      toast("error", err?.message || "РќРµ СѓРґР°Р»РѕСЃСЊ РѕС‚РјРµРЅРёС‚СЊ Р·Р°РєР°Р·");
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
        productName: order.items[0]?.name ?? "РўРѕРІР°СЂ",
        sellerId: order.sellerId,
        buyerId: order.userId,
        buyerName: profile?.displayName ?? "РџРѕРєСѓРїР°С‚РµР»СЊ",
        rating,
        text: reviewText.trim(),
      });
      setOrder({ ...order, reviewSubmitted: true });
      setReviewOpen(false);
      toast("success", "РЎРїР°СЃРёР±Рѕ Р·Р° РѕС‚Р·С‹РІ!");
    } catch (err: any) {
      if (err?.message === "review-already-submitted") toast("warning", "РћС‚Р·С‹РІ СѓР¶Рµ РѕСЃС‚Р°РІР»РµРЅ");
      else if (err?.message === "order-not-confirmed") toast("error", "Р—Р°РєР°Р· РµС‰С‘ РЅРµ РїРѕРґС‚РІРµСЂР¶РґС‘РЅ");
      else toast("error", "РќРµ СѓРґР°Р»РѕСЃСЊ РѕС‚РїСЂР°РІРёС‚СЊ РѕС‚Р·С‹РІ");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="card p-6 text-center text-white/40 text-sm">Р—Р°РіСЂСѓР·РєР° С‡Р°С‚Р°...</div>;

  return (
    // flex-col h-full вЂ” РѕР±СЏР·Р°С‚РµР»СЊРЅРѕ: СЂРѕРґРёС‚РµР»СЊ РІ app/chats/page.tsx РЅР° РјРѕР±РёР»СЊРЅС‹С… СЂРµРЅРґРµСЂРёС‚ РѕС‚РєСЂС‹С‚С‹Р№
    // С‡Р°С‚ РєР°Рє РїРѕР»РЅРѕСЌРєСЂР°РЅРЅС‹Р№ СЃР»РѕР№ СЃ overflow-hidden Рё Р¶С‘СЃС‚РєРѕ Р·Р°РґР°РЅРЅРѕР№ РІС‹СЃРѕС‚РѕР№ (РєР°Рє Сѓ DmThread).
    // Р Р°РЅСЊС€Рµ Р·РґРµСЃСЊ Р±С‹Р» РѕР±С‹С‡РЅС‹Р№ Р±Р»РѕС‡РЅС‹Р№ div вЂ” РёС‚РѕРіРѕРІР°СЏ РІС‹СЃРѕС‚Р° РєРѕРЅС‚РµРЅС‚Р° (С€Р°РїРєР° + РєР°СЂС‚РѕС‡РєР° СЃРґРµР»РєРё +
    // СЃРѕРѕР±С‰РµРЅРёСЏ + РєРЅРѕРїРєРё + С„РѕСЂРјР°) РЅР° С‚РµР»РµС„РѕРЅРµ РїСЂРµРІС‹С€Р°Р»Р° РІС‹СЃРѕС‚Сѓ РєРѕРЅС‚РµР№РЅРµСЂР°, Рё РїРѕР»Рµ РІРІРѕРґР° РІРЅРёР·Сѓ
    // РїСЂРѕСЃС‚Рѕ РѕР±СЂРµР·Р°Р»РѕСЃСЊ Р·Р° РІРёРґРёРјРѕР№ РѕР±Р»Р°СЃС‚СЊСЋ вЂ” РєР°Р·Р°Р»РѕСЃСЊ, С‡С‚Рѕ "РЅРµР»СЊР·СЏ РїРёСЃР°С‚СЊ", С…РѕС‚СЏ С„РѕСЂРјР° Р±С‹Р»Р° РЅР°
    // РјРµСЃС‚Рµ, РїСЂРѕСЃС‚Рѕ РЅРµРІРёРґРёРјР°/РЅРµРґРѕСЃС‚СѓРїРЅР° РґР»СЏ С‚Р°РїР°.
    <div className="flex flex-col h-full min-h-0">
      <div className="mb-3 shrink-0">
        <p className="font-bold">{counterpartName}</p>
        <p className="text-xs text-white/40">Р—Р°РєР°Р· #{orderId.slice(0, 8)}</p>
      </div>

      {order && (
        <div className="shrink-0">
          {/* РљР»РёРє РїРѕ С‚РѕРІР°СЂСѓ РѕС‚РєСЂС‹РІР°РµС‚ РєР°СЂС‚РѕС‡РєСѓ СЃРґРµР»РєРё: С„РѕС‚Рѕ, СЃС‚Р°С‚СѓСЃ Рё РІРµСЃСЊ С‚Р°Р№РјР»Р°Р№РЅ С€Р°РіРѕРІ вЂ”
              РІРєР»СЋС‡Р°СЏ РѕР±СЏР·Р°С‚РµР»СЊРЅС‹Р№ РёРіСЂРѕРІРѕР№ РЅРёРє вЂ” РІ РѕРґРЅРѕРј РјРµСЃС‚Рµ, Р° РЅРµ СЂР°Р·РјР°Р·Р°РЅРЅС‹Рј РїРѕ С‡Р°С‚Сѓ. */}
          <button
            onClick={() => setDealOpen(true)}
            className="w-full card p-3 flex items-center gap-3 mb-3 text-left transition-colors hover:bg-white/[0.03] active:scale-[0.99]"
          >
            <div className="relative w-11 h-11 rounded-btn overflow-hidden bg-black/30 shrink-0">
              {itemImage && <Image src={safeImageSrc(itemImage)} alt="" fill className="object-cover" sizes="44px" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{order.items.map((i) => i.name).join(", ")}</p>
              <p className="text-accent text-sm font-semibold">{order.total.toFixed(2)} в‚Ѕ</p>
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
              <p className="text-red-400 font-medium mb-1">Р–Р°Р»РѕР±Р°: {dispute.reason}</p>
              <p className="text-white/40 text-xs">
                РЎС‚Р°С‚СѓСЃ:{" "}
                {dispute.status === "open" ? "СЂР°СЃСЃРјР°С‚СЂРёРІР°РµС‚СЃСЏ Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂРѕРј" : dispute.status === "approved" ? "РѕРґРѕР±СЂРµРЅР°" : "РѕС‚РєР»РѕРЅРµРЅР°"}
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
        </div>
      )}

      {/* flex-1 min-h-0 вЂ” С‚СЏРЅРµС‚СЃСЏ РЅР° РІСЃС‘ РѕСЃС‚Р°РІС€РµРµСЃСЏ РјРµСЃС‚Рѕ Рё РїСЂРѕРєСЂСѓС‡РёРІР°РµС‚СЃСЏ СЃР°РјРѕ, Р° РЅРµ СЂР°Р·РґСѓРІР°РµС‚
          РѕР±С‰СѓСЋ РІС‹СЃРѕС‚Сѓ РєРѕРјРїРѕРЅРµРЅС‚Р° (СЌС‚Рѕ Рё Р±С‹Р»Рѕ РїСЂРёС‡РёРЅРѕР№ РѕР±СЂРµР·Р°РЅРЅРѕРіРѕ РїРѕР»СЏ РІРІРѕРґР° РЅР° С‚РµР»РµС„РѕРЅР°С…). */}
      <div className="flex-1 min-h-0 overflow-y-auto space-y-2 mb-3">
        {messages.length === 0 ? (
          <p className="text-sm text-white/30 text-center py-8">РЎРѕРѕР±С‰РµРЅРёР№ РїРѕРєР° РЅРµС‚. РќР°РїРёС€РёС‚Рµ РїРµСЂРІС‹Рј.</p>
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
                          background: `${avatarColor(m.from === "admin" ? "РђРґРјРёРЅ" : counterpartName)}22`,
                          color: avatarColor(m.from === "admin" ? "РђРґРјРёРЅ" : counterpartName),
                        }}
                      >
                        {initials(m.from === "admin" ? "РђРґРјРёРЅ" : counterpartName)}
                      </div>
                    )}
                    <div
                      className={`max-w-[75%] px-3 py-2 text-sm ${
                        isMine ? "bg-accent text-black rounded-2xl rounded-br-sm" : "bg-surface text-white/80 rounded-2xl rounded-bl-sm"
                      }`}
                    >
                      {!isMine && <p className="text-[10px] text-white/30 mb-0.5">{m.from === "admin" ? "РђРґРјРёРЅ" : counterpartName}</p>}
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
        <div className="flex flex-wrap gap-2 mb-3 shrink-0">
          {isBuyer && order.status === "confirmed" && !order.reviewSubmitted && (
            <button onClick={() => setReviewOpen((v) => !v)} className="btn-secondary px-4 py-2 text-xs flex items-center gap-1.5">
              <Star size={14} /> РћСЃС‚Р°РІРёС‚СЊ РѕС‚Р·С‹РІ
            </button>
          )}
          {isSeller && order.status === "pending_confirmation" && (
            <button onClick={handleCancel} disabled={busy} className="btn-secondary px-4 py-2 text-xs flex items-center gap-1.5 text-red-400 disabled:opacity-50">
              <XCircle size={14} /> РћС‚РјРµРЅРёС‚СЊ РїСЂРѕРґР°Р¶Сѓ
            </button>
          )}
        </div>
      )}

      {disputeOpen && (
        <form onSubmit={handleDispute} className="space-y-2 mb-3 shrink-0">
          <textarea
            value={disputeReason}
            onChange={(e) => setDisputeReason(e.target.value)}
            placeholder="РћРїРёС€Рё РїСЂРѕР±Р»РµРјСѓ вЂ” С‡С‚Рѕ РїРѕС€Р»Рѕ РЅРµ С‚Р°Рє СЃ СЌС‚РёРј Р·Р°РєР°Р·РѕРј"
            rows={2}
            className="input-field py-2 text-sm"
          />
          <button disabled={busy} className="btn-primary px-4 py-2 text-xs disabled:opacity-50">
            РћС‚РїСЂР°РІРёС‚СЊ Р¶Р°Р»РѕР±Сѓ
          </button>
        </form>
      )}

      {reviewOpen && (
        <form onSubmit={handleReview} className="space-y-2 mb-3 shrink-0">
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
            placeholder="РљР°Рє РІСЃС‘ РїСЂРѕС€Р»Рѕ?"
            rows={2}
            className="input-field py-2 text-sm"
          />
          <button disabled={busy} className="btn-primary px-4 py-2 text-xs disabled:opacity-50">
            РћС‚РїСЂР°РІРёС‚СЊ РѕС‚Р·С‹РІ
          </button>
        </form>
      )}

      <form onSubmit={handleSend} className="flex gap-2 shrink-0" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <input
          autoComplete="off"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="РќР°РїРёСЃР°С‚СЊ СЃРѕРѕР±С‰РµРЅРёРµ..."
          className="input-field py-2.5 text-sm flex-1"
        />
        <button type="submit" className="btn-primary px-4">
          <Send size={16} />
        </button>
      </form>
    </div>
  );
}

