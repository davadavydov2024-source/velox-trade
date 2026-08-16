"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { X, ArrowLeftRight, ShieldAlert } from "lucide-react";
import { getProducts } from "@/lib/products";
import { createTradeOffer } from "@/lib/trades";
import { Product } from "@/types";
import { safeImageSrc, isValidImageSrc } from "@/lib/safeImage";
import { useAuth } from "@/lib/authContext";
import { useToast } from "@/lib/toastContext";

export function TradeOfferModal({ targetProduct, onClose }: { targetProduct: Product; onClose: () => void }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [myProducts, setMyProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [extraBalance, setExtraBalance] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!user) return;
    // excludeWheelLocked: true — товар, запертый под колесо фортуны, нельзя предложить в обмен.
    getProducts({ sellerId: user.uid, excludeWheelLocked: true })
      .then((list) => setMyProducts(list.filter((p) => p.stock > 0)))
      .finally(() => setLoading(false));
  }, [user]);

  async function handleSubmit() {
    if (!selectedId) return;
    setSubmitting(true);
    try {
      await createTradeOffer({
        offeredProductId: selectedId,
        requestedProductId: targetProduct.id,
        extraBalance: Number(extraBalance) || undefined,
        message: message.trim() || undefined,
      });
      setDone(true);
      toast("success", "Предложение обмена отправлено");
    } catch (err: any) {
      toast("error", err?.message || "Не удалось отправить предложение");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" onClick={onClose}>
      <div className="card max-w-md w-full max-h-[90vh] overflow-y-auto p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <p className="font-semibold flex items-center gap-1.5">
            <ArrowLeftRight size={16} className="text-accent" /> Предложить обмен
          </p>
          <button onClick={onClose} className="p-1 text-white/40 hover:text-white">
            <X size={18} />
          </button>
        </div>

        {done ? (
          <div className="text-center py-6 space-y-2">
            <ArrowLeftRight size={28} className="mx-auto text-accent" />
            <p className="text-sm text-white/70">Предложение отправлено! Посмотреть статус можно в «Профиль → Обмены».</p>
            <button onClick={onClose} className="btn-primary px-5 py-2 text-sm mt-2">
              Закрыть
            </button>
          </div>
        ) : (
          <>
            {/* Целевой товар */}
            <div className="flex items-center gap-3 p-2.5 rounded-btn bg-white/5">
              <div className="w-12 h-12 rounded-md bg-black/30 overflow-hidden relative shrink-0">
                {isValidImageSrc(targetProduct.image) && (
                  <Image src={safeImageSrc(targetProduct.image)} alt="" fill className="object-cover" sizes="48px" />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-xs text-white/40">Ты хочешь получить</p>
                <p className="text-sm font-medium truncate">{targetProduct.name}</p>
              </div>
            </div>

            <div>
              <p className="text-xs text-white/40 mb-2">Выбери свой товар для обмена</p>
              {loading ? (
                <p className="text-xs text-white/30 py-4 text-center">Загрузка...</p>
              ) : myProducts.length === 0 ? (
                <p className="text-xs text-white/30 py-4 text-center">
                  У тебя нет товаров в наличии для обмена. Сначала выстави что-нибудь на продажу.
                </p>
              ) : (
                <div className="grid grid-cols-3 gap-2 max-h-48 overflow-y-auto">
                  {myProducts.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setSelectedId(p.id)}
                      className={`rounded-btn overflow-hidden border-2 transition-colors ${
                        selectedId === p.id ? "border-accent" : "border-transparent"
                      }`}
                    >
                      <div className="w-full aspect-square bg-black/30 relative">
                        {isValidImageSrc(p.image) && <Image src={safeImageSrc(p.image)} alt="" fill className="object-cover" sizes="80px" />}
                      </div>
                      <p className="text-[10px] px-1 py-1 truncate bg-white/5">{p.name}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <input
                type="number"
                min={0}
                value={extraBalance}
                onChange={(e) => setExtraBalance(e.target.value)}
                placeholder="Доплатить сверху, ₽ (необязательно)"
                className="input-field py-2 text-sm w-full"
              />
            </div>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Сообщение владельцу (необязательно)"
              rows={2}
              maxLength={300}
              className="input-field py-2 text-sm w-full resize-none"
            />

            <div className="flex items-start gap-2 text-xs text-yellow-400/80 bg-yellow-500/5 border border-yellow-500/20 rounded-btn p-2.5">
              <ShieldAlert size={14} className="shrink-0 mt-0.5" />
              Обмен идёт только через ботов-посредников сайта — никогда не передавай свой предмет первым напрямую другому
              игроку в обход этой системы. За сделки, совершённые в обход платформы, сайт ответственности не несёт.
            </div>

            <button
              onClick={handleSubmit}
              disabled={!selectedId || submitting}
              className="btn-primary w-full py-3 disabled:opacity-50"
            >
              {submitting ? "Отправляем..." : "Отправить предложение"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
