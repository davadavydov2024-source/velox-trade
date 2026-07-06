"use client";

import { useEffect, useState } from "react";
import { Check, X, Tag } from "lucide-react";
import { getAllSellRequests, setSellRequestStatus } from "@/lib/sellRequests";
import { SellRequest } from "@/types";
import { useToast } from "@/lib/toastContext";

export default function AdminSellRequestsPage() {
  const [requests, setRequests] = useState<SellRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    getAllSellRequests()
      .then(setRequests)
      .finally(() => setLoading(false));
  }, []);

  async function handleStatus(r: SellRequest, status: "approved" | "rejected") {
    try {
      await setSellRequestStatus(r.id, status);
      setRequests((list) => list.map((x) => (x.id === r.id ? { ...x, status } : x)));
      toast("success", status === "approved" ? "Заявка одобрена" : "Заявка отклонена");
    } catch (err: any) {
      if (err?.code === "permission-denied") {
        toast("error", "Нет прав на запись. Проверь, что твой UID указан в firestore.rules как админ.");
      } else {
        toast("error", "Не удалось обновить заявку");
      }
    }
  }

  const pending = requests.filter((r) => r.status === "pending");
  const resolved = requests.filter((r) => r.status !== "pending");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold mb-1 flex items-center gap-2">
          <Tag className="text-accent" size={22} /> Заявки на продажу
        </h1>
        <p className="text-sm text-white/40 mb-4">
          Одобрение здесь только меняет статус заявки — сам товар в каталог по-прежнему добавляется вручную через
          «Товары», после того как ты договорился с продавцом.
        </p>

        {loading ? (
          <div className="card p-6 text-center text-white/40">Загрузка...</div>
        ) : pending.length === 0 ? (
          <div className="card p-6 text-center text-white/40">Новых заявок нет</div>
        ) : (
          <div className="space-y-2">
            {pending.map((r) => (
              <div key={r.id} className="card p-4">
                <div className="flex items-center justify-between mb-1">
                  <p className="font-medium">
                    {r.itemName} — {r.game}
                  </p>
                  <p className="text-xs text-white/30">{new Date(r.createdAt).toLocaleString("ru-RU")}</p>
                </div>
                <p className="text-sm text-white/60 mb-1">
                  Цена: {r.price} ₽ · От: {r.userNick}
                </p>
                {r.description && <p className="text-sm text-white/40 mb-3">{r.description}</p>}
                <div className="flex gap-2">
                  <button onClick={() => handleStatus(r, "approved")} className="btn-primary px-4 py-2 text-sm flex items-center gap-1.5">
                    <Check size={14} /> Одобрить
                  </button>
                  <button onClick={() => handleStatus(r, "rejected")} className="btn-secondary px-4 py-2 text-sm flex items-center gap-1.5">
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
                  <th className="p-3">Предмет</th>
                  <th className="p-3">От</th>
                  <th className="p-3">Цена</th>
                  <th className="p-3">Статус</th>
                </tr>
              </thead>
              <tbody>
                {resolved.map((r) => (
                  <tr key={r.id} className="border-b border-border/50">
                    <td className="p-3">{r.itemName}</td>
                    <td className="p-3">{r.userNick}</td>
                    <td className="p-3">{r.price} ₽</td>
                    <td className="p-3">
                      <span className={r.status === "approved" ? "text-green-400" : "text-red-400"}>
                        {r.status === "approved" ? "Одобрена" : "Отклонена"}
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
