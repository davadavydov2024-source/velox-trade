"use client";

import { useEffect, useState } from "react";
import { MessageSquare, Send, CheckCircle2 } from "lucide-react";
import { getAllTickets, addTicketMessage, setTicketStatus } from "@/lib/tickets";
import { SupportTicket } from "@/types";
import { useToast } from "@/lib/toastContext";

const STATUS_LABEL: Record<SupportTicket["status"], { text: string; color: string }> = {
  open: { text: "Ожидает ответа", color: "#ff9800" },
  answered: { text: "Отвечено", color: "#4caf50" },
  closed: { text: "Закрыто", color: "#9aa3b2" },
};

export default function AdminSupportPage() {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [filter, setFilter] = useState<"all" | SupportTicket["status"]>("open");
  const { toast } = useToast();

  useEffect(() => {
    refresh();
  }, []);

  async function refresh() {
    setLoading(true);
    try {
      setTickets(await getAllTickets());
    } catch (err: any) {
      if (err?.code === "permission-denied") {
        toast("error", "Нет прав на чтение. Проверь, что твой UID указан в firestore.rules как админ.");
      }
    } finally {
      setLoading(false);
    }
  }

  const active = tickets.find((t) => t.id === activeId) ?? null;
  const filtered = filter === "all" ? tickets : tickets.filter((t) => t.status === filter);

  async function handleReply(e: React.FormEvent) {
    e.preventDefault();
    if (!active || !reply.trim()) return;
    setSending(true);
    try {
      await addTicketMessage(active.id, "admin", reply);
      const updatedMsg = { from: "admin" as const, text: reply, createdAt: Date.now() };
      setTickets((list) =>
        list.map((t) => (t.id === active.id ? { ...t, messages: [...t.messages, updatedMsg], status: "answered" } : t))
      );
      setReply("");
    } catch {
      toast("error", "Не удалось отправить ответ");
    } finally {
      setSending(false);
    }
  }

  async function handleClose(id: string) {
    await setTicketStatus(id, "closed");
    setTickets((list) => list.map((t) => (t.id === id ? { ...t, status: "closed" } : t)));
  }

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Поддержка</h1>

      <div className="flex gap-2">
        {(["open", "answered", "closed", "all"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-btn text-xs font-medium ${
              filter === f ? "bg-accent text-black" : "bg-surface text-white/50"
            }`}
          >
            {f === "all" ? "Все" : STATUS_LABEL[f].text}
          </button>
        ))}
      </div>

      <div className="grid md:grid-cols-[280px_1fr] gap-4">
        <div className="card p-2 max-h-[600px] overflow-y-auto">
          {loading ? (
            <p className="text-center text-white/40 text-sm py-6">Загрузка...</p>
          ) : filtered.length === 0 ? (
            <p className="text-center text-white/40 text-sm py-6">Обращений нет</p>
          ) : (
            filtered.map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveId(t.id)}
                className={`w-full text-left p-3 rounded-btn mb-1 transition-colors ${
                  activeId === t.id ? "bg-accent/15" : "hover:bg-white/5"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium truncate">{t.subject}</p>
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: STATUS_LABEL[t.status].color }} />
                </div>
                <p className="text-xs text-white/40 truncate">{t.userName} · {t.userEmail}</p>
              </button>
            ))
          )}
        </div>

        <div className="card p-5">
          {!active ? (
            <div className="text-center text-white/30 py-20">
              <MessageSquare className="mx-auto mb-2" size={28} />
              Выбери обращение слева
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="font-bold">{active.subject}</p>
                  <p className="text-xs text-white/40">{active.userName} · {active.userEmail}</p>
                </div>
                {active.status !== "closed" && (
                  <button onClick={() => handleClose(active.id)} className="btn-secondary px-3 py-1.5 text-xs flex items-center gap-1.5">
                    <CheckCircle2 size={13} /> Закрыть тикет
                  </button>
                )}
              </div>

              <div className="space-y-3 mb-4 max-h-96 overflow-y-auto">
                {active.messages.map((m, i) => (
                  <div key={i} className={`flex ${m.from === "admin" ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[80%] rounded-btn px-3 py-2 text-sm ${
                        m.from === "admin" ? "bg-accent/15 text-white" : "bg-surface text-white/80"
                      }`}
                    >
                      <p className="text-[10px] text-white/30 mb-0.5">{m.from === "admin" ? "Ты (админ)" : active.userName}</p>
                      {m.text}
                    </div>
                  </div>
                ))}
              </div>

              {active.status !== "closed" && (
                <form onSubmit={handleReply} className="flex gap-2">
                  <input
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    placeholder="Ответить пользователю..."
                    className="input-field py-2.5 text-sm flex-1"
                  />
                  <button disabled={sending || !reply.trim()} className="btn-primary px-4 disabled:opacity-50">
                    <Send size={16} />
                  </button>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
