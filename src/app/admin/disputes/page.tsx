"use client";

import { useEffect, useState } from "react";
import { Check, X, AlertTriangle } from "lucide-react";
import { getAllDisputes, resolveDispute } from "@/lib/disputes";
import { Dispute } from "@/types";
import { useToast } from "@/lib/toastContext";

export default function AdminDisputesPage() {
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    getAllDisputes()
      .then(setDisputes)
      .finally(() => setLoading(false));
  }, []);

  async function handleResolve(d: Dispute, approve: boolean) {
    try {
      await resolveDispute(d.orderId, approve);
      setDisputes((list) => list.map((x) => (x.id === d.id ? { ...x, status: approve ? "approved" : "rejected" } : x)));
      toast("success", approve ? "Жалоба одобрена" : "Жалоба отклонена");
    } catch (err: any) {
      if (err?.code === "permission-denied") {
        toast("error", "Нет прав на запись. Проверь, что твой UID указан в firestore.rules как админ.");
      } else {
        toast("error", "Не удалось обновить жалобу");
      }
    }
  }

  const open = disputes.filter((d) => d.status === "open");
  const resolved = disputes.filter((d) => d.status !== "open");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold mb-1 flex items-center gap-2">
          <AlertTriangle className="text-accent" size={22} /> Жалобы на сделки
        </h1>
        <p className="text-sm text-white/40 mb-4">
          Одобрение жалобы — сигнал, что сделка признана проблемной; отклонение — что заказ в порядке. Возврат
          средств при одобрении делай вручную через Пользователи → изменить баланс, пока в проекте нет
          автоматического возврата.
        </p>

        {loading ? (
          <div className="card p-6 text-center text-white/40">Загрузка...</div>
        ) : open.length === 0 ? (
          <div className="card p-6 text-center text-white/40">Открытых жалоб нет</div>
        ) : (
          <div className="space-y-2">
            {open.map((d) => (
              <div key={d.id} className="card p-4">
                <div className="flex items-center justify-between mb-1">
                  <p className="font-medium">
                    Заказ #{d.orderId.slice(0, 8)} — от {d.buyerName}
                  </p>
                  <p className="text-xs text-white/30">{new Date(d.createdAt).toLocaleString("ru-RU")}</p>
                </div>
                <p className="text-sm text-white/60 mb-3">{d.reason}</p>
                <div className="flex gap-2">
                  <button onClick={() => handleResolve(d, true)} className="btn-primary px-4 py-2 text-sm flex items-center gap-1.5">
                    <Check size={14} /> Одобрить
                  </button>
                  <button onClick={() => handleResolve(d, false)} className="btn-secondary px-4 py-2 text-sm flex items-center gap-1.5">
                    <X size={14} /> Отклонить
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {resolved.length > 0 && (
        <div>
          <h2 className="text-lg font-bold mb-3">История</h2>
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-white/40 border-b border-border">
                  <th className="p-3">Заказ</th>
                  <th className="p-3">От</th>
                  <th className="p-3">Причина</th>
                  <th className="p-3">Статус</th>
                </tr>
              </thead>
              <tbody>
                {resolved.map((d) => (
                  <tr key={d.id} className="border-b border-border/50">
                    <td className="p-3">#{d.orderId.slice(0, 8)}</td>
                    <td className="p-3">{d.buyerName}</td>
                    <td className="p-3 text-white/50">{d.reason}</td>
                    <td className="p-3">
                      <span className={d.status === "approved" ? "text-green-400" : "text-red-400"}>
                        {d.status === "approved" ? "Одобрена" : "Отклонена"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
