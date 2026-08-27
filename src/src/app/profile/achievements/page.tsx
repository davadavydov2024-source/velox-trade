"use client";

import { useEffect, useState } from "react";
import {
  Trophy,
  Lock,
  ShoppingBag,
  Tag,
  Disc3,
  Users,
  UserCheck,
  ShieldCheck,
  Star,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { useToast } from "@/lib/toastContext";
import { ACHIEVEMENTS, CATEGORY_LABEL, AchievementCategory } from "@/lib/achievements";
import { RARITY_COLOR } from "@/lib/rarityColors";
import { RARITY_LABEL } from "@/types";

const CATEGORY_ICON: Record<AchievementCategory, LucideIcon> = {
  purchases: ShoppingBag,
  sales: Tag,
  wheel: Disc3,
  community: Users,
  account: UserCheck,
  trust: Star,
};

interface AchievementResult {
  id: string;
  progress: number;
  threshold: number;
  unlocked: boolean;
  justUnlocked: boolean;
}

export default function AchievementsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [results, setResults] = useState<Record<string, AchievementResult> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const idToken = await user.getIdToken();
        const res = await fetch("/api/achievements", { headers: { Authorization: `Bearer ${idToken}` } });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        const map: Record<string, AchievementResult> = {};
        (data.results as AchievementResult[]).forEach((r) => (map[r.id] = r));
        setResults(map);

        const justUnlocked = (data.results as AchievementResult[]).filter((r) => r.justUnlocked);
        if (justUnlocked.length > 0) {
          const names = justUnlocked.map((r) => ACHIEVEMENTS.find((a) => a.id === r.id)?.title).filter(Boolean);
          toast("success", `🏆 Новое достижение: ${names.join(", ")}!`);
        }
      } catch {
        toast("error", "Не удалось загрузить достижения");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const unlockedCount = results ? Object.values(results).filter((r) => r.unlocked).length : 0;

  const categories = Array.from(new Set(ACHIEVEMENTS.map((a) => a.category)));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-1 flex items-center gap-2">
          <Trophy size={22} className="text-accent" /> Достижения
        </h1>
        <p className="text-sm text-white/40">
          {loading ? "Считаем прогресс..." : `Открыто ${unlockedCount} из ${ACHIEVEMENTS.length}`}
        </p>
      </div>

      {loading ? (
        <div className="card p-10 text-center text-white/40">Загрузка...</div>
      ) : (
        categories.map((cat) => {
          const CatIcon = CATEGORY_ICON[cat];
          const items = ACHIEVEMENTS.filter((a) => a.category === cat);
          return (
            <div key={cat} className="space-y-3">
              <p className="text-sm font-semibold text-white/60 flex items-center gap-2">
                <CatIcon size={15} /> {CATEGORY_LABEL[cat]}
              </p>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {items.map((def) => {
                  const r = results?.[def.id];
                  const unlocked = r?.unlocked ?? false;
                  const progress = r?.progress ?? 0;
                  const pct = Math.min(100, Math.round((progress / def.threshold) * 100));
                  // Секретные достижения показываем как "???" пока не открыты, чтобы сохранить интригу.
                  const hidden = def.secret && !unlocked;

                  return (
                    <div
                      key={def.id}
                      className="card p-4 space-y-2 transition-all duration-200 hover:-translate-y-0.5"
                      style={{
                        borderTop: `2px solid ${unlocked ? RARITY_COLOR[def.rarity] : "rgba(255,255,255,0.08)"}`,
                        opacity: unlocked ? 1 : 0.55,
                        boxShadow: unlocked ? `0 0 0 1px ${RARITY_COLOR[def.rarity]}33` : undefined,
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="w-9 h-9 rounded-btn flex items-center justify-center shrink-0"
                          style={{
                            background: unlocked ? `${RARITY_COLOR[def.rarity]}22` : "rgba(255,255,255,0.05)",
                            color: unlocked ? RARITY_COLOR[def.rarity] : "rgba(255,255,255,0.3)",
                          }}
                        >
                          {unlocked ? <ShieldCheck size={16} /> : <Lock size={14} />}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{hidden ? "???" : def.title}</p>
                          <p className="text-[10px] font-semibold" style={{ color: unlocked ? RARITY_COLOR[def.rarity] : "rgba(255,255,255,0.25)" }}>
                            {RARITY_LABEL[def.rarity]}
                          </p>
                        </div>
                      </div>
                      <p className="text-xs text-white/40">{hidden ? "Секретное достижение — открой, чтобы узнать условие." : def.description}</p>
                      <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                        <div
                          className="h-full transition-all"
                          style={{ width: `${hidden ? 0 : pct}%`, background: unlocked ? RARITY_COLOR[def.rarity] : "var(--accent, #6C5CE7)" }}
                        />
                      </div>
                      {!hidden && (
                        <p className="text-[11px] text-white/30 text-right">
                          {progress}/{def.threshold}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
