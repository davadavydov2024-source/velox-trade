"use client";

import { useEffect, useState } from "react";
import { getActiveEvent } from "@/lib/events";
import { useAuth } from "@/lib/authContext";
import { useToast } from "@/lib/toastContext";
import { SiteEvent, EventTheme } from "@/types";

// Фиксированные позиции — без Math.random() при рендере, чтобы не было расхождения SSR/CSR (hydration mismatch).
const POSITIONS = [3, 9, 15, 22, 29, 36, 43, 50, 57, 64, 71, 78, 85, 92, 97];

/** Общий "дождь" эмодзи — используется для всех тем, которые сыплют что-то с неба или снизу вверх. */
function ParticleRain({ emojis, direction = "fall" }: { emojis: string[]; direction?: "fall" | "rise" }) {
  const keyframeName = direction === "fall" ? "eventFall" : "eventRise";
  return (
    <div className="fixed inset-0 pointer-events-none z-30 overflow-hidden" aria-hidden="true">
      <style>{`
        @keyframes eventFall {
          0% { transform: translateY(-10vh) rotate(0deg); opacity: 0.9; }
          100% { transform: translateY(110vh) rotate(360deg); opacity: 0.5; }
        }
        @keyframes eventRise {
          0% { transform: translateY(10vh) rotate(0deg); opacity: 0; }
          15% { opacity: 0.9; }
          100% { transform: translateY(-110vh) rotate(-20deg); opacity: 0.4; }
        }
      `}</style>
      {POSITIONS.map((left, i) => (
        <span
          key={i}
          style={{
            position: "absolute",
            left: `${left}%`,
            top: direction === "fall" ? "-5vh" : undefined,
            bottom: direction === "rise" ? "-5vh" : undefined,
            fontSize: `${10 + (i % 4) * 4}px`,
            animation: `${keyframeName} ${8 + (i % 5) * 2}s linear infinite`,
            animationDelay: `${i * 0.7}s`,
          }}
        >
          {emojis[i % emojis.length]}
        </span>
      ))}
    </div>
  );
}

function GlowCorner({ color }: { color: string }) {
  return (
    <div className="fixed inset-0 pointer-events-none z-30 overflow-hidden" aria-hidden="true">
      <div
        style={{
          position: "absolute",
          top: "-80px",
          right: "-80px",
          width: 280,
          height: 280,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${color} 0%, transparent 70%)`,
        }}
      />
    </div>
  );
}

const THEME_CONFIG: Record<EventTheme, { emoji: string; particles: string[]; direction: "fall" | "rise"; glow?: string; gradient: string }> = {
  winter: { emoji: "❄️", particles: ["❄️"], direction: "fall", gradient: "from-sky-400/20 to-sky-400/5" },
  summer: { emoji: "☀️", particles: [], direction: "fall", glow: "rgba(255,200,60,0.35)", gradient: "from-amber-400/20 to-amber-400/5" },
  birthday: { emoji: "🎂", particles: ["🎈", "🎉", "🎊"], direction: "fall", gradient: "from-pink-400/20 to-purple-400/10" },
  milestone: { emoji: "✨", particles: ["✨", "🎆", "⭐"], direction: "fall", gradient: "from-amber-400/20 to-accent/10" },
  update: { emoji: "🚀", particles: ["⚡", "🚀", "✨"], direction: "rise", glow: "rgba(80,180,255,0.3)", gradient: "from-cyan-400/20 to-blue-500/10" },
  weekly: { emoji: "🔄", particles: ["⭐", "🔄"], direction: "fall", gradient: "from-accent/20 to-accent/5" },
  none: { emoji: "🎉", particles: [], direction: "fall", gradient: "from-accent/20 to-accent/5" },
};

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
  const cfg = THEME_CONFIG[event.theme] ?? THEME_CONFIG.none;

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
      {cfg.particles.length > 0 && <ParticleRain emojis={cfg.particles} direction={cfg.direction} />}
      {cfg.glow && <GlowCorner color={cfg.glow} />}
      <div className={`relative z-40 bg-gradient-to-r ${cfg.gradient} border-b border-accent/30`}>
        <div className="max-w-7xl mx-auto px-4 py-2.5 flex items-center justify-between gap-3 text-sm flex-wrap">
          <span className="flex items-center gap-2">
            {cfg.emoji} {event.name} — получи бонус на баланс!
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
