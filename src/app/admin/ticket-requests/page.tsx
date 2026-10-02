"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Ticket, MessageSquare } from "lucide-react";
import { getAllTicketRequests, offerTickets, rejectTicketRequest, completeTicketRequest } from "@/lib/ticketRequests";
import { safeImageSrc } from "@/lib/safeImage";
import { useToast } from "@/lib/toastContext";
import { TicketRequest } from "@/types";
import { AdminUserLinkButton } from "@/components/AdminUserLinkButton";

const STATUS_LABEL: Record<TicketRequest["status"], { text: string; color: string }> = {
  pending: { text: "Ждёт оценки", color: "#ff9800" },
  offered: { text: "Ждём ответа пользователя", color: "#9aa3b2" },
  accepted: { text: "Согласился — ждём предмет", color: "#4a6cf7" },
  declined: { text: "Пользователь отказался", color: "#9aa3b2" },
  completed: { text: "Завершено", color: "#4ade80" },
  rejected: { text: "Отклонено", color: "#f87171" },
};

export default function AdminTicketRequestsPage() {
  const { toast } = useToast();
  const [requests, setRequests] = useState<TicketRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [offerInputs, setOfferInputs] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);

  useEffect(() => {
    refresh();
  }, []);

  async function refresh() {
    setLoading(true);
    setRequests(await getAllTicketRequests());
    setLoading(false);
  }

  async function handleOffer(r: TicketRequest) {
    const tickets = Math.floor(Number(offerInputs[r.id]));
    if (!tickets || tickets <= 0) return toast("warning", "Укажи сумму тикетов больше нуля");
    setBusyId(r.id);
    try {
      await offerTickets(r, tickets);
      toast("success", "Предложение отправлено пользователю");
      await refresh();
    } catch {
      toast("error", "Не удалось отправить предложение");
    } finally {
      setBusyId(null);
    }
  }

  async function handleReject(r: TicketRequest) {
    if (!confirm("Отклонить заявку?")) return;
    setBusyId(r.id);
    try {
      await rejectTicketRequest(r);
      await refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function handleComplete(r: TicketRequest) {
    if (!confirm(`Подтвердить, что предмет получен? Пользователю зачислится ${r.offeredTickets} 🎫.`)) return;
    setBusyId(r.id);
    try {
      await completeTicketRequest(r);
      toast("success", "Тикеты зачислены");
      await refresh();
    } catch {
      toast("error", "Не удалось зачислить тикеты");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-1 flex items-center gap-2">
          <Ticket className="text-accent" size={22} /> Заявки на тикеты
        </h1>
        <p className="text-sm text-white/40 max-w-2xl">
          Пользователи присылают фото предмета — ты называешь сумму тикетов. После согласия открывается личная переписка;
          когда предмет реально получен в игре, нажми «Получено — зачислить» — только тогда тикеты попадут на баланс.
        </p>
      </div>

      {loading ? (
        <div className="card p-10 text-center text-white/40">Загрузка...</div>
      ) : requests.length === 0 ? (
        <div className="card p-10 text-center text-white/40">Заявок пока нет.</div>
      ) : (
        <div className="space-y-3">
          {requests.map((r) => (
            <div key={r.id} className="card p-4 flex gap-4 flex-wrap sm:flex-nowrap">
              <button onClick={() => setLightbox(r.photoUrl)} className="shrink-0">
                <img src={safeImageSrc(r.photoUrl)} alt="" className="w-24 h-24 rounded-btn object-cover bg-black/30" />
              </button>
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium">{r.userNick}</p>
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md" style={{ background: `${STATUS_LABEL[r.status].color}22`, color: STATUS_LABEL[r.status].color }}>
                    {STATUS_LABEL[r.status].text}
                  </span>
                  {r.offeredTickets ? <span className="text-xs text-accent">{r.offeredTickets} 🎫</span> : null}
                  <AdminUserLinkButton uid={r.userId} />
                </div>
                <p className="text-xs text-white/50">{r.description || "Без описания"}</p>

                {r.status === "pending" && (
                  <div className="flex gap-2 flex-wrap items-center">
                    <input
                      autoComplete="off"
                      type="number"
                      min={1}
                      value={offerInputs[r.id] ?? ""}
                      onChange={(e) => setOfferInputs({ ...offerInputs, [r.id]: e.target.value })}
                      placeholder="Сколько тикетов"
                      className="input-field py-2 text-sm w-40"
                    />
                    <button onClick={() => handleOffer(r)} disabled={busyId === r.id} className="btn-primary px-4 py-2 text-xs disabled:opacity-50">
                      Предложить
                    </button>
                    <button onClick={() => handleReject(r)} disabled={busyId === r.id} className="btn-secondary px-4 py-2 text-xs text-red-400 disabled:opacity-50">
                      Отклонить
                    </button>
                  </div>
                )}

                {r.status === "accepted" && (
                  <div className="flex gap-2 flex-wrap">
                    <Link href={`/chats?dm=${r.userId}`} className="btn-secondary px-4 py-2 text-xs flex items-center gap-1.5">
                      <MessageSquare size={13} /> Открыть переписку
                    </Link>
                    <button onClick={() => handleComplete(r)} disabled={busyId === r.id} className="btn-primary px-4 py-2 text-xs disabled:opacity-50">
                      Получено — зачислить
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {lightbox && (
        <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
          <img src={safeImageSrc(lightbox)} alt="" className="max-w-full max-h-full rounded-lg object-contain" />
        </div>
      )}
    </div>
  );
}
