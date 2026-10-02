"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Ticket, Send, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { useToast } from "@/lib/toastContext";
import { getMyTicketRequests, createTicketRequest, acceptTicketOffer, declineTicketOffer } from "@/lib/ticketRequests";
import { getPrimaryAdminUid } from "@/lib/users";
import { ImageUploadField } from "@/components/ImageUploadField";
import { safeImageSrc } from "@/lib/safeImage";
import { TicketRequest } from "@/types";

const STATUS_LABEL: Record<TicketRequest["status"], { text: string; color: string }> = {
  pending: { text: "Ждёт рассмотрения", color: "#9aa3b2" },
  offered: { text: "Есть предложение", color: "#ff9800" },
  accepted: { text: "Сделка открыта", color: "#4a6cf7" },
  declined: { text: "Отклонено тобой", color: "#9aa3b2" },
  completed: { text: "Зачислено", color: "#4ade80" },
  rejected: { text: "Отклонено админом", color: "#f87171" },
};

export default function TicketsPage() {
  const { user, profile, refreshProfile } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const [requests, setRequests] = useState<TicketRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [photo, setPhoto] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [buyAmount, setBuyAmount] = useState("50");
  const [buying, setBuying] = useState(false);

  useEffect(() => {
    if (!user) return;
    getMyTicketRequests(user.uid)
      .then(setRequests)
      .finally(() => setLoading(false));
  }, [user]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !profile) return;
    if (!photo) return toast("warning", "Прикрепи фото предмета");
    setSubmitting(true);
    try {
      await createTicketRequest(user.uid, profile.displayName, photo, description.trim());
      toast("success", "Заявка отправлена — жди предложения от администратора");
      setPhoto("");
      setDescription("");
      setRequests(await getMyTicketRequests(user.uid));
    } catch {
      toast("error", "Не удалось отправить заявку");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleBuy(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setBuying(true);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/tickets/buy", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ tickets: Number(buyAmount) }),
      });
      const data = await res.json();
      if (!res.ok) return toast("error", data.error || "Не удалось купить тикеты");
      toast("success", `Куплено ${data.tickets} 🎫 за ${data.cost} ₽`);
      await refreshProfile();
    } catch {
      toast("error", "Не удалось купить тикеты");
    } finally {
      setBuying(false);
    }
  }

  async function handleAccept(r: TicketRequest) {
    const adminUid = getPrimaryAdminUid();
    if (!adminUid) return toast("error", "Не удалось найти администратора");
    setBusyId(r.id);
    try {
      await acceptTicketOffer(r, adminUid);
      toast("success", "Сделка открыта — договоритесь в личных сообщениях");
      router.push(`/chats?dm=${adminUid}`);
    } catch {
      toast("error", "Не удалось принять предложение");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDecline(r: TicketRequest) {
    setBusyId(r.id);
    try {
      await declineTicketOffer(r);
      setRequests((list) => list.map((x) => (x.id === r.id ? { ...x, status: "declined" } : x)));
    } catch {
      toast("error", "Не удалось отклонить предложение");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Ticket size={20} className="text-accent" /> Тикеты
        </h1>
        <p className="text-accent font-bold flex items-center gap-1.5">
          {(profile?.ticketBalance ?? 0).toFixed(0)} 🎫
        </p>
      </div>

      <form onSubmit={handleBuy} className="card p-5 mb-4 flex items-end gap-3 flex-wrap">
        <div className="flex-1 min-w-[160px]">
          <p className="font-medium text-sm mb-1">Пополнить тикеты с баланса</p>
          <input
            autoComplete="off"
            type="number"
            min={1}
            value={buyAmount}
            onChange={(e) => setBuyAmount(e.target.value)}
            className="input-field py-2.5 text-sm w-full"
          />
        </div>
        <button disabled={buying} className="btn-primary px-5 py-2.5 text-sm disabled:opacity-50">
          {buying ? "Покупаем..." : "Купить тикеты"}
        </button>
      </form>

      <div className="card p-5 mb-6">
        <p className="font-medium text-sm mb-1">Сдать предмет за тикеты</p>
        <p className="text-xs text-white/40 mb-4">
          Пришли фото предмета — администратор посмотрит и предложит, сколько тикетов за него даст. Если согласишься,
          откроется переписка, где вы договоритесь о передаче. Тикеты зачислятся, как только предмет реально получат.
        </p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <ImageUploadField value={photo} onChange={setPhoto} folder="ticket-requests" label="Фото предмета" />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Что за предмет, из какой игры — необязательно, но поможет оценить быстрее"
            rows={2}
            className="input-field py-2.5 text-sm w-full"
          />
          <button disabled={submitting} className="btn-primary px-5 py-2.5 text-sm flex items-center gap-2 disabled:opacity-50">
            {submitting ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
            Отправить заявку
          </button>
        </form>
      </div>

      <p className="text-sm font-medium mb-2">Мои заявки</p>
      {loading ? (
        <div className="card p-10 text-center text-white/40">Загрузка...</div>
      ) : requests.length === 0 ? (
        <div className="card p-10 text-center text-white/40">Заявок пока нет.</div>
      ) : (
        <div className="space-y-2">
          {requests.map((r) => (
            <div key={r.id} className="card p-3 flex items-center gap-3">
              <img src={safeImageSrc(r.photoUrl)} alt="" className="w-12 h-12 rounded-btn object-cover bg-black/30 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-xs text-white/40 truncate">{r.description || "Без описания"}</p>
                <p className="text-xs font-medium" style={{ color: STATUS_LABEL[r.status].color }}>
                  {STATUS_LABEL[r.status].text}
                  {r.status === "offered" && ` — предложено ${r.offeredTickets} 🎫`}
                  {r.status === "completed" && ` — +${r.offeredTickets} 🎫`}
                </p>
              </div>
              {r.status === "offered" && (
                <div className="flex gap-1.5 shrink-0">
                  <button onClick={() => handleAccept(r)} disabled={busyId === r.id} className="btn-primary px-3 py-1.5 text-xs disabled:opacity-50">
                    Принять
                  </button>
                  <button onClick={() => handleDecline(r)} disabled={busyId === r.id} className="btn-secondary px-3 py-1.5 text-xs disabled:opacity-50">
                    Отклонить
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
