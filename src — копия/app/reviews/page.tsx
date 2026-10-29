"use client";

import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { useToast } from "@/lib/toastContext";
import { getSiteReviews, createSiteReview, hasUserReviewedSite } from "@/lib/siteReviews";
import { SiteReview } from "@/types";

export default function SiteReviewsPage() {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const [reviews, setReviews] = useState<SiteReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [alreadyReviewed, setAlreadyReviewed] = useState(false);
  const [rating, setRating] = useState<1 | 2 | 3 | 4 | 5>(5);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getSiteReviews()
      .then(setReviews)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (user) hasUserReviewedSite(user.uid).then(setAlreadyReviewed);
  }, [user]);

  const avg = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !text.trim()) return;
    setBusy(true);
    try {
      await createSiteReview({
        userId: user.uid,
        userName: profile?.displayName ?? "Пользователь",
        rating,
        text: text.trim(),
      });
      setText("");
      setAlreadyReviewed(true);
      const fresh = await getSiteReviews();
      setReviews(fresh);
      toast("success", "Спасибо за отзыв!");
    } catch (err: any) {
      toast("error", err?.code === "permission-denied" ? "Нет прав отправить отзыв" : "Не удалось отправить отзыв");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-10 space-y-8">
      <div>
        <h1 className="text-2xl font-bold mb-1">Отзывы о Velox Trade</h1>
        {reviews.length > 0 && (
          <div className="flex items-center gap-2 text-white/60 text-sm">
            <div className="flex">
              {[1, 2, 3, 4, 5].map((n) => (
                <Star key={n} size={16} className={n <= Math.round(avg) ? "text-accent fill-accent" : "text-white/20"} />
              ))}
            </div>
            {avg.toFixed(1)} · {reviews.length} {reviews.length === 1 ? "отзыв" : "отзывов"}
          </div>
        )}
      </div>

      {!user ? (
        <div className="card p-5 text-sm text-white/50">
          Чтобы оставить отзыв о сайте, нужно <a href="/auth/login" className="text-accent hover:underline">войти</a>.
        </div>
      ) : alreadyReviewed ? (
        <div className="card p-5 text-sm text-white/50">Ты уже оставил отзыв о сайте — спасибо!</div>
      ) : (
        <form onSubmit={handleSubmit} className="card p-5 space-y-3">
          <p className="font-medium text-sm">Оставить отзыв</p>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" onClick={() => setRating(n as 1 | 2 | 3 | 4 | 5)}>
                <Star size={22} className={n <= rating ? "text-accent fill-accent" : "text-white/20"} />
              </button>
            ))}
          </div>
          <textarea
            required
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Как тебе сайт? Что понравилось, а что можно улучшить?"
            rows={3}
            className="input-field py-2.5 text-sm"
          />
          <button disabled={busy} className="btn-primary px-5 py-2.5 text-sm disabled:opacity-50">
            Отправить отзыв
          </button>
        </form>
      )}

      <div className="space-y-3">
        {loading ? (
          <div className="card p-6 text-center text-white/40 text-sm">Загрузка...</div>
        ) : reviews.length === 0 ? (
          <div className="card p-6 text-center text-white/40 text-sm">Отзывов пока нет — будь первым.</div>
        ) : (
          reviews.map((r) => (
            <div key={r.id} className="card p-4">
              <div className="flex items-center justify-between mb-1.5">
                <p className="font-medium text-sm">{r.userName}</p>
                <div className="flex">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Star key={n} size={13} className={n <= r.rating ? "text-accent fill-accent" : "text-white/20"} />
                  ))}
                </div>
              </div>
              <p className="text-sm text-white/60">{r.text}</p>
              <p className="text-[11px] text-white/30 mt-2">{new Date(r.createdAt).toLocaleDateString("ru-RU")}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
