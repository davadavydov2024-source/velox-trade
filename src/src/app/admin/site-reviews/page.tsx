"use client";

import { useEffect, useState } from "react";
import { Star, Trash2 } from "lucide-react";
import { getSiteReviews, deleteSiteReview } from "@/lib/siteReviews";
import { SiteReview } from "@/types";
import { useToast } from "@/lib/toastContext";

export default function AdminSiteReviewsPage() {
  const { toast } = useToast();
  const [reviews, setReviews] = useState<SiteReview[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    refresh();
  }, []);

  async function refresh() {
    setLoading(true);
    try {
      setReviews(await getSiteReviews());
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(r: SiteReview) {
    if (!confirm(`Удалить отзыв от ${r.userName}?`)) return;
    try {
      await deleteSiteReview(r.id);
      setReviews((list) => list.filter((x) => x.id !== r.id));
      toast("success", "Отзыв удалён");
    } catch {
      toast("error", "Не удалось удалить отзыв");
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">Отзывы о сайте</h1>
        <p className="text-sm text-white/40">Публичные отзывы на странице /reviews. Можно удалить неуместные.</p>
      </div>

      <div className="space-y-3">
        {loading ? (
          <div className="card p-6 text-center text-white/40 text-sm">Загрузка...</div>
        ) : reviews.length === 0 ? (
          <div className="card p-6 text-center text-white/40 text-sm">Отзывов пока нет</div>
        ) : (
          reviews.map((r) => (
            <div key={r.id} className="card p-4 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <p className="font-medium text-sm">{r.userName}</p>
                  <div className="flex">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Star key={n} size={12} className={n <= r.rating ? "text-accent fill-accent" : "text-white/20"} />
                    ))}
                  </div>
                  <span className="text-[11px] text-white/30">{new Date(r.createdAt).toLocaleDateString("ru-RU")}</span>
                </div>
                <p className="text-sm text-white/60">{r.text}</p>
              </div>
              <button onClick={() => handleDelete(r)} className="p-2 rounded-md hover:bg-white/10 text-red-400 shrink-0">
                <Trash2 size={16} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
