"use client";

import { useEffect } from "react";
import Image from "next/image";
import { X, CheckCircle2, AlertTriangle } from "lucide-react";
import { Order, Delivery } from "@/types";
import { safeImageSrc } from "@/lib/safeImage";
import { OrderDealTimeline } from "@/components/OrderDealTimeline";
import { DeliveryPanel } from "@/components/DeliveryPanel";

/**
 * Модалка/шит с деталями сделки: открывается кликом по товару/собеседнику в шапке чата заказа.
 * Собирает в одном месте то, что раньше было размазано по всему чату — фото товара, статус,
 * таймлайн шагов (включая обязательный ник) и сами действия подтверждения/спора.
 */
export function DealSheet({
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
  // Esc закрывает — мелочь, но ожидаемое поведение для модалки.
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
            <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center text-white/50 hover:bg-white/5 hover:text-white shrink-0 transition-colors">
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
