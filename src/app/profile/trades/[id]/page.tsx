"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ShieldAlert, Send } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { useToast } from "@/lib/toastContext";
import { getTradeById, subscribeTradeChat, sendTradeChatMessage, TradeChat } from "@/lib/trades";
import { TradeOffer } from "@/types";
import { DeliveryPanel } from "@/components/DeliveryPanel";

export default function TradeChatPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { toast } = useToast();
  const [trade, setTrade] = useState<TradeOffer | null | undefined>(undefined);
  const [chat, setChat] = useState<TradeChat | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getTradeById(id)
      .then(setTrade)
      .catch(() => setTrade(null));
  }, [id]);

  useEffect(() => {
    const unsub = subscribeTradeChat(id, setChat);
    return unsub;
  }, [id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat?.messages.length]);

  if (trade === undefined) return <p className="text-center text-white/40 py-16">Загрузка...</p>;
  if (!trade || !user || (user.uid !== trade.fromUserId && user.uid !== trade.toUserId)) {
    return <p className="text-center text-white/40 py-16">Обмен не найден.</p>;
  }

  const isFromUser = user.uid === trade.fromUserId;
  const myRole: "fromUser" | "toUser" = isFromUser ? "fromUser" : "toUser";

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || !trade) return;
    setSending(true);
    try {
      await sendTradeChatMessage(trade.id, trade.fromUserId, trade.toUserId, myRole, text.trim());
      setText("");
    } catch {
      toast("error", "Не удалось отправить сообщение");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <Link href="/profile/trades" className="text-sm text-white/40 hover:text-white flex items-center gap-1.5">
        <ArrowLeft size={14} /> Все обмены
      </Link>

      <div className="flex items-start gap-2 text-xs text-yellow-400/80 bg-yellow-500/5 border border-yellow-500/20 rounded-btn p-3">
        <ShieldAlert size={14} className="shrink-0 mt-0.5" />
        Никогда не передавай свой предмет первым напрямую другому игроку — оба предмета проходят только через ботов-посредников
        ниже. Сайт не несёт ответственности за сделки, совершённые в обход этой системы.
      </div>

      {trade.status !== "accepted" ? (
        <div className="card p-6 text-center text-white/40 text-sm">Этот обмен ещё не принят или уже завершён другим статусом.</div>
      ) : (
        <>
          {/* Leg A: fromUser получает requested, toUser отдаёт */}
          <DeliveryPanel orderId={`${trade.id}_a`} isBuyer={isFromUser} isSeller={!isFromUser} />
          {/* Leg B: toUser получает offered, fromUser отдаёт */}
          <DeliveryPanel orderId={`${trade.id}_b`} isBuyer={!isFromUser} isSeller={isFromUser} />
        </>
      )}

      <div className="card p-4 space-y-3">
        <p className="text-sm font-semibold">Чат обмена</p>
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {(chat?.messages ?? []).map((m, i) => {
            const mine = m.from === myRole;
            const system = m.from === "system" || m.from === "admin";
            return (
              <div key={i} className={system ? "text-center" : `flex ${mine ? "justify-end" : "justify-start"}`}>
                {system ? (
                  <p className="text-xs text-white/40 italic px-3">{m.text}</p>
                ) : (
                  <div className={`max-w-[80%] px-3 py-2 rounded-btn text-sm ${mine ? "bg-accent text-black" : "bg-white/5 text-white/80"}`}>
                    {m.text}
                  </div>
                )}
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
        <form onSubmit={handleSend} className="flex gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Написать сообщение..."
            className="input-field py-2 text-sm flex-1"
          />
          <button disabled={sending || !text.trim()} className="btn-primary px-4 py-2 disabled:opacity-50">
            <Send size={16} />
          </button>
        </form>
      </div>
    </div>
  );
}
