"use client";

import { useEffect, useState } from "react";
import { Send } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { useToast } from "@/lib/toastContext";
import { getOrderChat, sendOrderChatMessage } from "@/lib/orderChats";
import { getOrderById } from "@/lib/users";
import { OrderChatMessage, Order } from "@/types";
import { useLanguage } from "@/lib/languageStore";
import { tf } from "@/lib/i18n";

export function OrderChatThread({ orderId, counterpartName }: { orderId: string; counterpartName: string }) {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const { toast } = useToast();
  const [order, setOrder] = useState<Order | null>(null);
  const [messages, setMessages] = useState<OrderChatMessage[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([getOrderChat(orderId), getOrderById(orderId)])
      .then(([chat, ord]) => {
        setMessages(chat?.messages ?? []);
        setOrder(ord);
      })
      .finally(() => setLoading(false));
  }, [orderId]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || !user || !order) return;
    const value = text.trim();
    setText("");
    const from: OrderChatMessage["from"] = order.userId === user.uid ? "buyer" : "seller";
    setMessages((m) => [...m, { from, text: value, createdAt: Date.now() }]);
    try {
      await sendOrderChatMessage(orderId, order.userId, order.sellerId, from, value);
    } catch {
      toast("error", t("orders_toast_send_msg_failed"));
    }
  }

  if (loading) return <div className="card p-6 text-center text-white/40 text-sm">{t("orders_chat_loading")}</div>;

  return (
    <div>
      <div className="mb-4">
        <p className="font-bold">{counterpartName}</p>
        <p className="text-xs text-white/40">
          {tf(language, "orders_order_number", { id: orderId.slice(0, 8) })}
          {order && <> · {order.items.map((i) => i.name).join(", ")} · {order.total.toFixed(2)} ₽</>}
        </p>
      </div>

      <div className="space-y-2 max-h-[420px] overflow-y-auto mb-3">
        {messages.length === 0 ? (
          <p className="text-sm text-white/30 text-center py-8">{t("order_chat_no_messages")}</p>
        ) : (
          messages.map((m, i) => {
            const isMine = user && order && ((order.userId === user.uid && m.from === "buyer") || (order.sellerId === user.uid && m.from === "seller"));
            return (
              <div key={i} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] rounded-btn px-3 py-2 text-sm ${isMine ? "bg-accent/15 text-white" : "bg-surface text-white/80"}`}>
                  <p className="text-[10px] text-white/30 mb-0.5">{m.from === "admin" ? t("orders_chat_admin") : isMine ? t("orders_chat_you") : counterpartName}</p>
                  {m.text}
                </div>
              </div>
            );
          })
        )}
      </div>

      <form onSubmit={handleSend} className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t("orders_chat_placeholder")}
          className="input-field py-2.5 text-sm flex-1"
        />
        <button className="btn-primary px-4">
          <Send size={16} />
        </button>
      </form>
    </div>
  );
}
