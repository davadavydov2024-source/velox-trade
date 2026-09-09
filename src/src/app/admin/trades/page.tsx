"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { ArrowLeftRight, Send, Search, ExternalLink } from "lucide-react";
import { getAllTrades, subscribeTradeChat, sendTradeChatMessage, TradeChat } from "@/lib/trades";
import { TradeOffer, TradeOfferStatus } from "@/types";
import { safeImageSrc, isValidImageSrc } from "@/lib/safeImage";
import { useToast } from "@/lib/toastContext";

const STATUS_LABEL: Record<TradeOfferStatus, { text: string; color: string }> = {
  pending: { text: "Ожидает ответа", color: "#ff9800" },
  accepted: { text: "Принято", color: "#4caf50" },
  rejected: { text: "Отклонено", color: "#f44336" },
  cancelled: { text: "Отменено", color: "#9aa3b2" },
};

export default function AdminTradesPage() {
  const { toast } = useToast();
  const [trades, setTrades] = useState<TradeOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [chat, setChat] = useState<TradeChat | null>(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    getAllTrades()
      .then(setTrades)
      .catch(() => toast("error", "Не удалось загрузить обмены — проверь, что твой UID в списке админов"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!activeId) {
      setChat(null);
      return;
    }
    const unsub = subscribeTradeChat(activeId, setChat);
    return unsub;
  }, [activeId]);

  const active = trades.find((t) => t.id === activeId) ?? null;

  const filtered = trades.filter((t) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (
      t.id.toLowerCase().includes(q) ||
      t.fromUserNick.toLowerCase().includes(q) ||
      t.toUserNick.toLowerCase().includes(q) ||
      t.offeredProductName.toLowerCase().includes(q) ||
      t.requestedProductName.toLowerCase().includes(q)
    );
  });

  async function handleReply(e: React.FormEvent) {
    e.preventDefault();
    if (!active || !reply.trim()) return;
    setSending(true);
    try {
      await sendTradeChatMessage(active.id, active.fromUserId, active.toUserId, "admin", reply.trim());
      setReply("");
    } catch {
      toast("error", "Не удалось отправить сообщение");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold mb-1 flex items-center gap-2">
          <ArrowLeftRight size={22} /> Обмены между игроками
        </h1>
        <p className="text-sm text-white/40 max-w-2xl">
          Полный список сделок обмена. Обычно сюда заходят по обращению из поддержки — найди сделку по нику или названию
          товара (или вставь ID сделки из ссылки, которую прислал пользователь) и подключись к переписке прямо здесь.
        </p>
      </div>

      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Поиск по нику, товару или ID сделки..."
          className="input-field py-2.5 pl-9 text-sm w-full max-w-md"
        />
      </div>

      <div className="grid md:grid-cols-[340px_1fr] gap-4">
        <div className="card p-2 md:max-h-[70vh] md:overflow-y-auto space-y-1">
          {loading ? (
            <p className="text-center text-white/40 text-sm py-6">Загрузка...</p>
          ) : filtered.length === 0 ? (
            <p className="text-center text-white/40 text-sm py-6">Ничего не найдено.</p>
          ) : (
            filtered.map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveId(t.id)}
                className={`w-full text-left p-2.5 rounded-btn transition-colors ${activeId === t.id ? "bg-accent/15" : "hover:bg-white/5"}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-white/40 truncate">
                    {t.fromUserNick} → {t.toUserNick}
                  </p>
                  <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded shrink-0" style={{ background: `${STATUS_LABEL[t.status].color}22`, color: STATUS_LABEL[t.status].color }}>
                    {STATUS_LABEL[t.status].text}
                  </span>
                </div>
                <p className="text-sm truncate mt-0.5">
                  {t.offeredProductName} ⇄ {t.requestedProductName}
                </p>
              </button>
            ))
          )}
        </div>

        <div className="card p-4">
          {!active ? (
            <p className="text-center text-white/40 text-sm py-16">Выбери сделку слева.</p>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <div className="w-10 h-10 rounded-md bg-black/30 relative overflow-hidden">
                      {isValidImageSrc(active.offeredProductImage) && <Image src={safeImageSrc(active.offeredProductImage!)} alt="" fill className="object-cover" sizes="40px" />}
                    </div>
                    <div>
                      <p className="text-[10px] text-white/30">{active.fromUserNick} отдаёт</p>
                      <p className="text-xs font-medium">{active.offeredProductName}</p>
                    </div>
                  </div>
                  <ArrowLeftRight size={14} className="text-white/30" />
                  <div className="flex items-center gap-2">
                    <div className="w-10 h-10 rounded-md bg-black/30 relative overflow-hidden">
                      {isValidImageSrc(active.requestedProductImage) && <Image src={safeImageSrc(active.requestedProductImage!)} alt="" fill className="object-cover" sizes="40px" />}
                    </div>
                    <div>
                      <p className="text-[10px] text-white/30">{active.toUserNick} отдаёт</p>
                      <p className="text-xs font-medium">{active.requestedProductName}</p>
                    </div>
                  </div>
                </div>
                {active.status === "accepted" && (
                  <a href="/admin/deliveries" target="_blank" rel="noopener noreferrer" className="text-xs text-accent flex items-center gap-1 hover:underline">
                    Карточки выдачи в очереди <ExternalLink size={11} />
                  </a>
                )}
              </div>

              {active.status !== "accepted" ? (
                <p className="text-xs text-white/40">
                  Эта заявка ещё не принята обеими сторонами ({STATUS_LABEL[active.status].text.toLowerCase()}) — чат обмена
                  появится только после принятия.
                </p>
              ) : (
                <>
                  <div className="space-y-2 max-h-96 overflow-y-auto border-t border-white/5 pt-3">
                    {(chat?.messages ?? []).length === 0 ? (
                      <p className="text-xs text-white/30 text-center py-4">Сообщений пока нет.</p>
                    ) : (
                      (chat?.messages ?? []).map((m, i) => {
                        const isAdmin = m.from === "admin";
                        const label = m.from === "fromUser" ? active.fromUserNick : m.from === "toUser" ? active.toUserNick : m.from === "admin" ? "Админ" : "";
                        return (
                          <div key={i} className={m.from === "system" ? "text-center" : ""}>
                            {m.from === "system" ? (
                              <p className="text-xs text-white/40 italic">{m.text}</p>
                            ) : (
                              <div className={`text-sm p-2 rounded-btn max-w-[85%] ${isAdmin ? "bg-accent/15 ml-auto" : "bg-white/5"}`}>
                                <p className="text-[10px] text-white/40 mb-0.5">{label}</p>
                                {m.text}
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                  <form onSubmit={handleReply} className="flex gap-2">
                    <input
                      value={reply}
                      onChange={(e) => setReply(e.target.value)}
                      placeholder="Написать от имени администрации..."
                      className="input-field py-2 text-sm flex-1"
                    />
                    <button disabled={sending || !reply.trim()} className="btn-primary px-4 py-2 disabled:opacity-50">
                      <Send size={15} />
                    </button>
                  </form>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
