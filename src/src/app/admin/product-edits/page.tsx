"use client";

import { useEffect, useState } from "react";
import { Pencil } from "lucide-react";
import {
  getAllProductEditRequests,
  approveProductEditRequest,
  rejectProductEditRequest,
} from "@/lib/productEditRequests";
import { ProductEditRequest } from "@/types";
import { useToast } from "@/lib/toastContext";

export default function AdminProductEditsPage() {
  const { toast } = useToast();
  const [requests, setRequests] = useState<ProductEditRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    refresh();
  }, []);

  async function refresh() {
    setLoading(true);
    setRequests(await getAllProductEditRequests());
    setLoading(false);
  }

  async function handle(r: ProductEditRequest, approve: boolean) {
    try {
      if (approve) {
        await approveProductEditRequest(r);
      } else {
        await rejectProductEditRequest(r);
      }
      setRequests((list) => list.map((x) => (x.id === r.id ? { ...x, status: approve ? "approved" : "rejected" } : x)));
      toast("success", approve ? "Правки применены" : "Заявка отклонена");
    } catch {
      toast("error", "Не удалось обработать заявку");
    }
  }

  const pending = requests.filter((r) => r.status === "pending");
  const resolved = requests.filter((r) => r.status !== "pending");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold mb-1 flex items-center gap-2">
          <Pencil className="text-accent" size={22} /> Заявки на редактирование товаров
        </h1>
        <p className="text-sm text-white/40">
          Продавцы могут предложить изменить название/описание/цену/фото своего товара — до 3 раз на товар.
          Одобрение сразу применяет изменения.
        </p>
      </div>

      {loading ? (
        <div className="card p-10 text-center text-white/40">Загрузка...</div>
      ) : pending.length === 0 ? (
        <div className="card p-8 text-center text-white/40">Новых заявок нет.</div>
      ) : (
        <div className="space-y-3">
          {pending.map((r) => (
            <div key={r.id} className="card p-4">
              <p className="text-sm text-white/40 mb-2">Было: «{r.productName}»</p>
              <div className="grid sm:grid-cols-2 gap-3 text-sm mb-3">
                <div>
                  <p className="text-white/40 text-xs mb-0.5">Новое название</p>
                  <p>{r.proposedName}</p>
                </div>
                <div>
                  <p className="text-white/40 text-xs mb-0.5">Новая цена</p>
                  <p>{r.proposedPrice} ₽</p>
                </div>
                <div className="sm:col-span-2">
                  <p className="text-white/40 text-xs mb-0.5">Новое описание</p>
                  <p>{r.proposedDescription}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => handle(r, true)} className="btn-primary px-4 py-2 text-sm">
                  Одобрить
                </button>
                <button onClick={() => handle(r, false)} className="btn-secondary px-4 py-2 text-sm">
                  Отклонить
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {resolved.length > 0 && (
        <div>
          <h2 className="text-sm font-medium text-white/40 mb-2">Обработанные</h2>
          <div className="space-y-2">
            {resolved.map((r) => (
              <div key={r.id} className="card p-3 text-sm flex items-center justify-between">
                <span>«{r.productName}» → «{r.proposedName}»</span>
                <span className={r.status === "approved" ? "text-green-400" : "text-red-400"}>
                  {r.status === "approved" ? "Одобрено" : "Отклонено"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
