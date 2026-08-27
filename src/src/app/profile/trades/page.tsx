"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeftRight, Check, X, Ban, ShieldAlert } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { useToast } from "@/lib/toastContext";
import { getIncomingTrades, getOutgoingTrades, respondToTrade, TRADE_DISCLAIMER } from "@/lib/trades";
import { TradeOffer, TradeOfferStatus } from "@/types";
import { safeImageSrc, isValidImageSrc } from "@/lib/safeImage";
import { NotifyConnectBanner } from "@/components/NotifyConnectBanner";

const STATUS_LABEL: Record<TradeOfferStatus, { text: string; color: string }> = {
  pending: { text: "Ожидает ответа", color: "#ff9800" },
  accepted: { text: "Принято", color: "#4caf50" },
  rejected: { text: "Отклонено", color: "#f44336" },
  cancelled: { text: "Отменено", color: "#9aa3b2" },
};

function ItemThumb({ name, image }: { name: string; image?: string | null }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="w-9 h-9 rounded-md bg-black/30 overflow-hidden relative shrink-0">
        {isValidImageSrc(image) && <Image src={safeImageSrc(image)} alt="" fill className="object-cover" sizes="36px" />}
      </div>
      <p className="text-sm truncate">{name}</p>
    </div>
  );
}

export default function TradesPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [incoming, setIncoming] = useState<TradeOffer[]>([]);
  const [outgoing, setOutgoing] = useState<TradeOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function refresh() {
    if (!user) return;
    setLoading(true);
    const [inc, out] = await Promise.all([getIncomingTrades(user.uid), getOutgoingTrades(user.uid)]);
    setIncoming(inc);
    setOutgoing(out);
    setLoading(false);
  }

  async function handleRespond(tradeId: string, action: "accept" | "reject" | "cancel") {
    setBusyId(tradeId);
    try {
      await respondToTrade(tradeId, action);
      toast("success", action === "accept" ? "Обмен принят!" : action === "reject" ? "Обмен отклонён" : "Заявка отменена");
      await refresh();
    } catch (err: any) {
      toast("error", err?.message || "Не удалось выполнить действие");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-1 flex items-center gap-2">
          <ArrowLeftRight size={22} className="text-accent" /> Обмены
        </h1>
        <p className="text-sm text-white/40">Прямой обмен товарами с другими игроками — без денег или с доплатой сверху.</p>
      </div>

      <NotifyConnectBanner context="новые предложения обмена" storageKey="notifyBannerDismissed_trades" />

      <div className="flex items-start gap-2 text-xs text-yellow-400/80 bg-yellow-500/5 border border-yellow-500/20 rounded-btn p-3">
        <ShieldAlert size={14} className="shrink-0 mt-0.5" />
        {TRADE_DISCLAIMER}
      </div>

      {loading ? (
        <div className="card p-10 text-center text-white/40">Загрузка...</div>
      ) : (
        <>
          {incoming.filter((t) => t.status === "pending").length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-white/60">Тебе предложили</p>
              {incoming
                .filter((t) => t.status === "pending")
                .map((t) => (
                  <div key={t.id} className="card p-4 space-y-3">
                    <p className="text-xs text-white/40">{t.fromUserNick} предлагает обмен:</p>
                    <div className="flex items-center gap-3">
                      <ItemThumb name={t.offeredProductName} image={t.offeredProductImage} />
                      <ArrowLeftRight size={14} className="text-white/30 shrink-0" />
                      <ItemThumb name={t.requestedProductName} image={t.requestedProductImage} />
                    </div>
                    {t.extraBalanceFromProposer ? (
                      <p className="text-xs text-accent">+ доплата {t.extraBalanceFromProposer} ₽ в твою пользу</p>
                    ) : null}
                    {t.message && <p className="text-xs text-white/50 italic">«{t.message}»</p>}
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleRespond(t.id, "accept")}
                        disabled={busyId === t.id}
                        className="btn-primary px-4 py-2 text-xs flex items-center gap-1 disabled:opacity-50"
                      >
                        <Check size={13} /> Принять
                      </button>
                      <button
                        onClick={() => handleRespond(t.id, "reject")}
                        disabled={busyId === t.id}
                        className="btn-secondary px-4 py-2 text-xs flex items-center gap-1 disabled:opacity-50"
                      >
                        <X size={13} /> Отклонить
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          )}

          {[...incoming, ...outgoing].filter((t) => t.status === "accepted").length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-white/60">Активные обмены</p>
              {[...incoming, ...outgoing]
                .filter((t) => t.status === "accepted")
                .sort((a, b) => b.createdAt - a.createdAt)
                .map((t) => (
                  <Link key={t.id} href={`/profile/trades/${t.id}`} className="card p-4 flex items-center justify-between gap-3 hover:border-accent/30 transition-colors block">
                    <div className="flex items-center gap-3 min-w-0">
                      <ItemThumb name={t.offeredProductName} image={t.offeredProductImage} />
                      <ArrowLeftRight size={14} className="text-white/30 shrink-0" />
                      <ItemThumb name={t.requestedProductName} image={t.requestedProductImage} />
                    </div>
                    <span className="text-[10px] font-semibold px-2 py-1 rounded-md shrink-0" style={{ background: `${STATUS_LABEL.accepted.color}22`, color: STATUS_LABEL.accepted.color }}>
                      Открыть чат →
                    </span>
                  </Link>
                ))}
            </div>
          )}

          <div className="space-y-2">
            <p className="text-sm font-semibold text-white/60">Мои исходящие предложения</p>
            {outgoing.length === 0 ? (
              <p className="text-sm text-white/30">Ты ещё не предлагал обмен.</p>
            ) : (
              outgoing.map((t) => (
                <div key={t.id} className="card p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-white/40">Кому: {t.toUserNick}</p>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md" style={{ background: `${STATUS_LABEL[t.status].color}22`, color: STATUS_LABEL[t.status].color }}>
                      {STATUS_LABEL[t.status].text}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <ItemThumb name={t.offeredProductName} image={t.offeredProductImage} />
                    <ArrowLeftRight size={14} className="text-white/30 shrink-0" />
                    <ItemThumb name={t.requestedProductName} image={t.requestedProductImage} />
                  </div>
                  {t.status === "pending" && (
                    <button
                      onClick={() => handleRespond(t.id, "cancel")}
                      disabled={busyId === t.id}
                      className="btn-secondary px-3 py-1.5 text-xs flex items-center gap-1 disabled:opacity-50"
                    >
                      <Ban size={12} /> Отменить заявку
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
