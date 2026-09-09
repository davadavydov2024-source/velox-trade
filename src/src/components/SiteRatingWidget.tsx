"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Star, ArrowRight } from "lucide-react";
import { getSiteReviews } from "@/lib/siteReviews";
import { SiteReview } from "@/types";

export function SiteRatingWidget() {
  const [reviews, setReviews] = useState<SiteReview[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    getSiteReviews()
      .then(setReviews)
      .finally(() => setLoaded(true));
  }, []);

  const avg = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;
  const recent = reviews.slice(0, 3);

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 py-16 border-b border-border">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold mb-1">Отзывы о Velox Trade</h2>
          {loaded && reviews.length > 0 && (
            <div className="flex items-center gap-2 text-sm text-white/50">
              <div className="flex">
                {[1, 2, 3, 4, 5].map((n) => (
                  <Star key={n} size={15} className={n <= Math.round(avg) ? "text-accent fill-accent" : "text-white/20"} />
                ))}
              </div>
              <span>
                {avg.toFixed(1)} · {reviews.length} {reviews.length === 1 ? "отзыв" : "отзывов"}
              </span>
            </div>
          )}
        </div>
        <Link href="/reviews" className="text-accent text-sm font-medium flex items-center gap-1 hover:underline">
          {reviews.length > 0 ? "Все отзывы / оставить свой" : "Оставить первый отзыв"} <ArrowRight size={14} />
        </Link>
      </div>

      {loaded && reviews.length === 0 ? (
        <p className="text-sm text-white/40">Отзывов ещё нет — станьте первым, кто расскажет о своём опыте.</p>
      ) : (
        <div className="grid sm:grid-cols-3 gap-4">
          {recent.map((r) => (
            <div key={r.id} className="card p-4">
              <div className="flex items-center justify-between mb-1.5">
                <p className="font-medium text-sm truncate">{r.userName}</p>
                <div className="flex shrink-0">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Star key={n} size={12} className={n <= r.rating ? "text-accent fill-accent" : "text-white/20"} />
                  ))}
                </div>
              </div>
              <p className="text-sm text-white/60 line-clamp-3">{r.text}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
