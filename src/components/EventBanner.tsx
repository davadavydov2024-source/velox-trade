"use client";

import { useEffect, useState } from "react";
import { getActiveEvent } from "@/lib/events";
import { useAuth } from "@/lib/authContext";
import { useToast } from "@/lib/toastContext";
import { SiteEvent } from "@/types";

// Фиксированные позиции — без Math.random() при рендере, чтобы не было расхождения SSR/CSR (hydration mismatch).
const FLAKE_POSITIONS = [3, 9, 15, 22, 29, 36, 43, 50, 57, 64, 71, 78, 85, 92, 97];

function WinterDecoration() {
  return (
    <div className="fixed inset-0 pointer-events-none z-30 overflow-hidden" aria-hidden="true">
      <style>{`
        @keyframes snowfall {
          0% { transform: translateY(-10vh) rotate(0deg); opacity: 0.9; }
          100% { transform: translateY(110vh) rotate(360deg); opacity: 0.6; }
        }
      `}</style>
      {FLAKE_POSITIONS.map((left, i) => (
        <span
          key={i}
          style={{
            position: "absolute",
            left: `${left}%`,
            top: "-5vh",
            fontSize: `${10 + (i % 4) * 4}px`,
            animation: `snowfall ${8 + (i % 5) * 2}s linear infinite`,
            animationDelay: `${i * 0.7}s`,
          }}
        >
          ❄️
        </span>
      ))}
    </div>
  );
}

function SummerDecoration() {
  return (
    <div className="fixed inset-0 pointer-events-none z-30 overflow-hidden" aria-hidden="true">
      <div
        style={{
          position: "absolute",
          top: "-80px",
          right: "-80px",
          width: 260,
          height: 260,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(255,200,60,0.35) 0%, rgba(255,200,60,0) 70%)",
        }}
      />
    </div>
  );
}

export function EventBanner() {
  const { user, profile, refreshProfile } = useAuth();
  const { toast } = useToast();
  const [event, setEvent] = useState<SiteEvent | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    getActiveEvent()
      .then(setEvent)
      .catch(() => setEvent(null));
  }, []);

  if (!event || dismissed) return null;

  const alreadyClaimed = profile?.claimedEventIds?.includes(event.id) ?? false;
  const emoji = event.theme === "winter" ? "❄️" : event.theme === "summer" ? "☀️" : "🎉";

  async function handleClaim() {
    if (!user) {
      toast("warning", "Войди в аккаунт, чтобы получить бонус");
      return;
    }
    setClaiming(true);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/events/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ eventId: event!.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast("success", `+${data.bonus} ₽ на баланс!`);
      await refreshProfile();
    } catch (err: any) {
      toast("error", err.message || "Не удалось получить бонус");
    } finally {
      setClaiming(false);
    }
  }

  return (
    <>
      {event.theme === "winter" && <WinterDecoration />}
      {event.theme === "summer" && <SummerDecoration />}
      <div className="relative z-40 bg-gradient-to-r from-accent/20 to-accent/5 border-b border-accent/30">
        <div className="max-w-7xl mx-auto px-4 py-2.5 flex items-center justify-between gap-3 text-sm flex-wrap">
          <span className="flex items-center gap-2">
            {emoji} {event.name} — получи бонус на баланс!
          </span>
          <div className="flex items-center gap-2 shrink-0">
            {!alreadyClaimed ? (
              <button onClick={handleClaim} disabled={claiming} className="btn-primary px-3 py-1.5 text-xs disabled:opacity-50">
                {claiming ? "..." : `Забрать +${event.bonusRub} ₽`}
              </button>
            ) : (
              <span className="text-xs text-white/40">Бонус уже получен ✓</span>
            )}
            <button onClick={() => setDismissed(true)} className="text-white/30 hover:text-white/60 text-xs px-1" aria-label="Скрыть">
              ✕
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
