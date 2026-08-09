"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Trophy, Star, ShieldCheck } from "lucide-react";
import { safeImageSrc } from "@/lib/safeImage";
import { BADGE_COLOR, CHECKMARK_BADGES } from "@/types";

interface LeaderboardSeller {
  uid: string;
  displayName: string;
  username: string | null;
  photoURL: string | null;
  badges: string[];
  ratingCount: number;
  avgRating: number;
}

const MEDAL_COLOR = ["#ffd700", "#c0c0c0", "#cd7f32"];

export default function LeaderboardPage() {
  const [sellers, setSellers] = useState<LeaderboardSeller[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/leaderboard")
      .then((r) => r.json())
      .then((data) => setSellers(data.sellers ?? []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <div className="mb-8 text-center">
        <Trophy size={28} className="text-accent mx-auto mb-2" />
        <h1 className="text-2xl font-bold mb-1">Топ продавцов</h1>
        <p className="text-white/50 text-sm">Самые надёжные продавцы Velox Trade по отзывам покупателей</p>
      </div>

      {loading ? (
        <div className="card p-8 text-center text-white/40">Загрузка...</div>
      ) : sellers.length === 0 ? (
        <div className="card p-8 text-center text-white/40">
          Пока недостаточно отзывов, чтобы составить рейтинг — загляните позже.
        </div>
      ) : (
        <div className="space-y-2">
          {sellers.map((s, i) => {
            const checkmarks = s.badges.filter((b) => CHECKMARK_BADGES.includes(b as any));
            return (
              <Link
                key={s.uid}
                href={s.username ? `/seller/${s.username}` : "#"}
                className="card p-4 flex items-center gap-4 hover:bg-white/[0.03] transition-colors"
              >
                <div className="w-7 text-center font-bold text-lg shrink-0" style={{ color: MEDAL_COLOR[i] ?? "#5b6272" }}>
                  {i + 1}
                </div>
                <div className="relative w-12 h-12 rounded-full overflow-hidden bg-black/30 shrink-0 ring-1 ring-white/10">
                  <Image src={safeImageSrc(s.photoURL, "/placeholder.svg")} alt={s.displayName} fill className="object-cover" sizes="48px" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="font-semibold truncate">{s.displayName}</p>
                    {checkmarks.map((b) => (
                      <ShieldCheck key={b} size={14} style={{ color: BADGE_COLOR[b as keyof typeof BADGE_COLOR] }} />
                    ))}
                  </div>
                  <p className="text-xs text-white/40">{s.ratingCount} отзывов</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Star size={15} className="text-accent fill-accent" />
                  <span className="font-bold">{s.avgRating.toFixed(1)}</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
