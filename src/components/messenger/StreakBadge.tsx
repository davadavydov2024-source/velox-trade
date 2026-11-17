"use client";

import { liveStreak, STREAK_MIN, type ChatStreak } from "@/lib/messenger/streak";

/** Значок серии рядом с именем собеседника: 🔥7 — серия засчитана сегодня, бледный 🔥7 — нужно написать, ⏳7 — скоро сгорит. */
export function StreakBadge({ streak, size = 14, now }: { streak?: ChatStreak | null; size?: number; now?: number }) {
  const s = liveStreak(streak, now ?? Date.now());
  if (s.count < STREAK_MIN) return null;
  const warn = s.state === "warn";
  const hours = Math.max(1, Math.ceil(s.msLeft / 3600_000));
  const title = s.state === "done" ? `Серия ${s.count} дн. — на сегодня засчитана` : warn ? `Серия ${s.count} дн. скоро сгорит: напишите друг другу (осталось ~${hours} ч)` : `Серия ${s.count} дн. — напишите друг другу сегодня, чтобы продолжить`;
  const hot = s.count >= 30 ? "#ff3b30" : s.count >= 7 ? "#ff6a00" : "#ff9500";
  return (
    <span title={title} aria-label={title} className="inline-flex items-center gap-[1px] align-middle font-bold tabular-nums" style={{ fontSize: size - 2, color: hot, opacity: s.state === "alive" ? 0.55 : 1, marginLeft: 4 }}>
      <style>{`@keyframes mxFlame{0%,100%{transform:scale(1) rotate(-3deg)}50%{transform:scale(1.14) rotate(3deg)}}`}</style>
      <span style={{ fontSize: size, lineHeight: 1, display: "inline-block", animation: s.state === "done" ? "mxFlame 1.6s ease-in-out infinite" : undefined, filter: s.state === "alive" ? "grayscale(0.6)" : undefined }}>{warn ? "⏳" : "🔥"}</span>
      {s.count}
    </span>
  );
}
