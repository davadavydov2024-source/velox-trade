"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import { Star, ShieldCheck } from "lucide-react";
import { getUidByUsername } from "@/lib/usernames";
import { getUserProfile } from "@/lib/users";
import { getSellerReviews } from "@/lib/reviews";
import { getProducts } from "@/lib/products";
import { UserProfile, Review, Product, BADGE_COLOR, BADGE_LABEL, CHECKMARK_BADGES } from "@/types";
import { ProductCard } from "@/components/ProductCard";
import { safeImageSrc } from "@/lib/safeImage";

export default function SellerProfilePage() {
  const { username } = useParams<{ username: string }>();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const uid = await getUidByUsername(username);
      if (!uid) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      const [p, r, prod] = await Promise.all([getUserProfile(uid), getSellerReviews(uid), getProducts({ sellerId: uid })]);
      setProfile(p);
      setReviews(r);
      setProducts(prod);
      setLoading(false);
    }
    load().catch(() => {
      setNotFound(true);
      setLoading(false);
    });
  }, [username]);

  if (loading) return <div className="max-w-4xl mx-auto px-4 py-20 text-center text-white/40">Загрузка...</div>;
  if (notFound || !profile) return <div className="max-w-4xl mx-auto px-4 py-20 text-center text-white/40">Продавец не найден.</div>;

  const avgRating = profile.ratingCount ? (profile.ratingSum ?? 0) / profile.ratingCount : null;
  const checkmarks = profile.badges.filter((b) => CHECKMARK_BADGES.includes(b));
  const otherBadges = profile.badges.filter((b) => !CHECKMARK_BADGES.includes(b));

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10 space-y-8">
      <div className="card p-6 flex items-start gap-5">
        <div className="relative w-20 h-20 rounded-full overflow-hidden bg-black/30 shrink-0 ring-2 ring-accent/30">
          <Image src={safeImageSrc(profile.photoURL, "/placeholder.svg")} alt={profile.displayName} fill className="object-cover" sizes="80px" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <h1 className="text-xl font-bold">{profile.displayName}</h1>
            {checkmarks.map((b) => (
              <ShieldCheck key={b} size={18} style={{ color: BADGE_COLOR[b] }} aria-label={BADGE_LABEL[b]} />
            ))}
          </div>
          <p className="text-white/40 text-sm mb-2">@{profile.username}</p>
          {profile.bio && <p className="text-white/60 text-sm mb-2">{profile.bio}</p>}
          <div className="flex items-center gap-3 flex-wrap">
            {avgRating !== null && (
              <span className="flex items-center gap-1 text-sm text-accent font-medium">
                <Star size={14} className="fill-accent" /> {avgRating.toFixed(1)} ({profile.ratingCount})
              </span>
            )}
            <div className="flex flex-wrap gap-1">
              {otherBadges.map((b) => (
                <span
                  key={b}
                  className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                  style={{ background: `${BADGE_COLOR[b]}22`, color: BADGE_COLOR[b] }}
                >
                  {BADGE_LABEL[b]}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div>
        <h2 className="text-lg font-bold mb-3">Товары продавца ({products.length})</h2>
        {products.length === 0 ? (
          <div className="card p-8 text-center text-white/40">У продавца пока нет товаров в каталоге.</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {products.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        )}
      </div>

      <div>
        <h2 className="text-lg font-bold mb-3">Отзывы ({reviews.length})</h2>
        {reviews.length === 0 ? (
          <div className="card p-8 text-center text-white/40">Отзывов пока нет.</div>
        ) : (
          <div className="space-y-2">
            {reviews.map((r) => (
              <div key={r.id} className="card p-4">
                <div className="flex items-center justify-between mb-1">
                  <p className="font-medium text-sm">{r.buyerName}</p>
                  <div className="flex gap-0.5">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star key={i} size={12} className={i < r.rating ? "text-accent fill-accent" : "text-white/15"} />
                    ))}
                  </div>
                </div>
                <p className="text-xs text-white/40 mb-1">{r.productName}</p>
                {r.text && <p className="text-sm text-white/70">{r.text}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
