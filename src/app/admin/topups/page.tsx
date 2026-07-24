"use client";

import { useEffect, useState } from "react";
import { Check, X, Zap } from "lucide-react";
import { getTopUpRequests, setTopUpStatus, adjustUserBalance } from "@/lib/users";
import { cancelAllPendingPayments } from "@/lib/payments";
import { TopUpRequest } from "@/types";
import { useToast } from "@/lib/toastContext";

export default function AdminTopUpsPage() {
  const [requests, setRequests] = useState<TopUpRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [sweeping, setSweeping] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    getTopUpRequests()
      .then(setRequests)
      .finally(() => setLoading(false));
  }, []);

  async function handleCancelAllPending() {
    if (!confirm("Отменить ВСЕ текущие платежи со статусом «Ждём оплату» у всех пользователей? Если какой-то из них на самом деле уже оплачен, баланс будет зачислен, а не отменён.")) return;
    setSweeping(true);
    try {
      const res = await cancelAllPendingPayments();
      toast(
        "success",
        `Готово: отменено ${res.cancelled}, зачислено как оплаченные ${res.credited}${res.failed ? `, не удалось проверить ${res.failed}` : ""} из ${res.total}`
      );
    } catch (err: any) {
      toast("error", err?.message || "Не удалось выполнить массовую отмену");
    } finally {
      setSweeping(false);
    }
  }

  async function handleApprove(req: TopUpRequest) {
    try {
      const delta = req.type === "deposit" ? req.amount : -req.amount;
      await adjustUserBalance(req.userId, delta);
      await setTopUpStatus(req.id, "approved");
      setRequests((list) => list.map((r) => (r.id === req.id ? { ...r, status: "approved" } : r)));
      toast("success", "Заявка подтверждена, баланс обновлён");
    } catch (err: any) {
      if (err?.code === "permission-denied") {
        toast("error", "Нет прав на запись. Проверь, что твой UID указан в firestore.rules как админ.");
      } else {
        toast("error", "Ошибка при подтверждении заявки");
      }
      console.error(err);
    }
  }

  async function handleReject(req: TopUpRequest) {
    await setTopUpStatus(req.id, "rejected");
    setRequests((list) => list.map((r) => (r.id === req.id ? { ...r, status: "rejected" } : r)));
    toast("warning", "Заявка отклонена");
  }

  const pending = requests.filter((r) => r.status === "pending");
  const history = requests.filter((r) => r.status !== "pending");

  return (
    <div className="space-y-8">
      <div className="card p-5 border border-yellow-500/20 bg-yellow-500/5 flex items-center justify-between gap-4">
        <div>
          <p className="font-medium">Автоплатежи CactusPay</p>
          <p className="text-sm text-white/50 mt-1">
            Отменить прямо сейчас все платежи со статусом «Ждём оплату» у всех пользователей (например, чтобы
            почистить старые зависшие заявки). Каждый платёж перед отменой перепроверяется у самого CactusPay —
            если он на самом деле оплачен, баланс зачислится, а не отменится.
          </p>
        </div>
        <button onClick={handleCancelAllPending} disabled={sweeping} className="btn-secondary px-4 py-2.5 text-sm flex items-center gap-2 shrink-0 disabled:opacity-50">
          <Zap size={14} /> {sweeping ? "Проверяем..." : "Отменить все зависшие"}
        </button>
      </div>

      <div>
        <h1 className="text-2xl font-bold mb-4">Заявки на баланс</h1>
        <p className="text-sm text-white/40 mb-4">
          Подтверждайте заявку только после того, как реально получили деньги от пользователя (для пополнения) или
          отправили деньги (для вывода). Подтверждение здесь сразу меняет баланс пользователя.
        </p>

        {loading ? (
          <div className="card p-6 text-center text-white/40">Загрузка...</div>
        ) : pending.length === 0 ? (
          <div className="card p-6 text-center text-white/40">Нет новых заявок</div>
        ) : (
          <div className="space-y-2">
            {pending.map((r) => (
              <div key={r.id} className="card p-4 flex items-center justify-between">
                <div>
                  <p className="font-medium">
                    {r.userNick} — {r.type === "deposit" ? "пополнение" : "вывод"} {r.amount} ₽
                  </p>
                  <p className="text-xs text-white/40">{new Date(r.createdAt).toLocaleString("ru-RU")}</p>
                  {r.method && (
                    <p className="text-xs text-accent mt-1">
                      Способ: {{ qr: "QR-код", playerok: "Playerok", funpay: "FunPay", phone: "По номеру телефона" }[r.method]}
                    </p>
                  )}
                  {r.comment && <p className="text-xs text-white/50 mt-0.5">Комментарий: {r.comment}</p>}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => handleApprove(r)} className="btn-primary px-4 py-2 text-sm flex items-center gap-1.5">
                    <Check size={14} /> Подтвердить
                  </button>
                  <button onClick={() => handleReject(r)} className="btn-secondary px-4 py-2 text-sm flex items-center gap-1.5">
                    <X size={14} /> Отклонить
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h2 className="text-lg font-bold mb-3">История</h2>
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-white/40 border-b border-border">
                <th className="p-3">Пользователь</th>
                <th className="p-3">Тип</th>
                <th className="p-3">Сумма</th>
                <th className="p-3">Статус</th>
                <th className="p-3">Дата</th>
              </tr>
            </thead>
            <tbody>
              {history.map((r) => (
                <tr key={r.id} className="border-b border-border/50">
                  <td className="p-3">{r.userNick}</td>
                  <td className="p-3 text-white/50">{r.type === "deposit" ? "Пополнение" : "Вывод"}</td>
                  <td className="p-3">{r.amount} ₽</td>
                  <td className="p-3">
                    <span className={r.status === "approved" ? "text-green-400" : "text-red-400"}>
                      {r.status === "approved" ? "Подтверждена" : "Отклонена"}
                    </span>
                  </td>
                  <td className="p-3 text-white/40">{new Date(r.createdAt).toLocaleDateString("ru-RU")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
