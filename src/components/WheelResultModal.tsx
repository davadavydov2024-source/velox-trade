"use client";

import { useEffect, useRef, useState } from "react";
import { MessageCircle, X } from "lucide-react";
import { RARITY_COLOR } from "@/lib/rarityColors";
import { RARITY_LABEL, Rarity } from "@/types";
import { safeImageSrc } from "@/lib/safeImage";
import { WheelBurst } from "./WheelBurst";

export interface WheelPrizeResult {
  id: string;
  type: "product" | "balance" | "nothing";
  name: string;
  image?: string;
  balanceRub?: number;
  orderId?: string;
}

/** Плавно «накручивает» число от 0 до значения — для суммы выигрыша. */
function CountUp({ to, duration = 1100 }: { to: number; duration?: number }) {
  const [value, setValue] = useState(0);
  const raf = useRef<number | null>(null);
  useEffect(() => {
    const start = performance.now();
    const frame = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(Math.round(to * eased));
      if (p < 1) raf.current = requestAnimationFrame(frame);
    };
    raf.current = requestAnimationFrame(frame);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [to, duration]);
  return <>{value}</>;
}

const SPARKLES = [
  { top: "-6%", left: "8%", delay: "0s", size: 22 },
  { top: "6%", left: "92%", delay: "0.4s", size: 18 },
  { top: "62%", left: "-8%", delay: "0.8s", size: 20 },
  { top: "92%", left: "88%", delay: "1.1s", size: 24 },
  { top: "-10%", left: "62%", delay: "0.6s", size: 16 },
  { top: "86%", left: "4%", delay: "1.3s", size: 18 },
];

/**
 * Экран результата. Победа: затемнение, вращающиеся лучи цвета редкости, карточка с «перелётом»,
 * пульсирующее кольцо, искры, взрыв конфетти (у редких — сильнее и со вспышкой), у денег — дождь монет
 * и счётчик суммы. Проигрыш: серый, без салюта, карточка вздрагивает, тихие капли, спокойный текст.
 */
export function WheelResultModal({
  result,
  rarity,
  cooldownText,
  onClose,
  onChat,
}: {
  result: WheelPrizeResult;
  rarity?: string;
  cooldownText?: string;
  onClose: () => void;
  onChat?: () => void;
}) {
  const lost = result.type === "nothing";
  const isBalance = result.type === "balance";
  const rar = (rarity ?? "common") as Rarity;
  const color = lost ? "#6b7280" : isBalance ? "#4ade80" : RARITY_COLOR[rar] ?? RARITY_COLOR.common;
  const big = !lost && !isBalance && (rar === "legendary" || rar === "epic");

  const title = lost
    ? "Не повезло…"
    : isBalance
      ? "Деньги твои!"
      : rar === "legendary"
        ? "Легендарно!"
        : rar === "epic"
          ? "Эпик!"
          : rar === "rare"
            ? "Редкая находка!"
            : "Победа!";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const rayColor = `${color}${big ? "55" : "38"}`;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 wheel-fade-in" role="dialog" aria-modal="true" aria-label="Результат колеса">
      <div className="absolute inset-0 bg-black/80" onClick={onClose} />

      {!lost && (
        <div
          className="wheel-rays"
          style={{ background: `repeating-conic-gradient(from 0deg, ${rayColor} 0deg 7deg, transparent 7deg 22deg)` }}
        />
      )}
      {lost && <div className="absolute inset-0 bg-gradient-to-b from-slate-900/40 to-black/60 pointer-events-none" />}

      {/* Частицы */}
      {!lost && !isBalance && (
        <WheelBurst
          key={`b-${result.id}-${result.orderId ?? ""}`}
          variant="confetti"
          count={big ? 130 : 70}
          colors={[color, "#ffffff", "#ffd76b", color, "#ff8fb1"]}
        />
      )}
      {isBalance && (
        <>
          <WheelBurst key={`c-${result.id}`} variant="coins" count={34} />
          <WheelBurst key={`k-${result.id}`} variant="confetti" count={50} colors={["#4ade80", "#ffd76b", "#ffffff"]} />
        </>
      )}
      {lost && <WheelBurst key={`s-${result.id}`} variant="sad" count={26} />}
      {big && <div className="wheel-flash absolute inset-0 bg-white pointer-events-none" />}

      <div
        className="relative w-full max-w-sm rounded-3xl border p-6 pt-8 text-center wheel-card-pop"
        style={{
          borderColor: `${color}55`,
          background: lost
            ? "linear-gradient(180deg, rgba(30,34,44,0.97), rgba(16,18,24,0.97))"
            : `linear-gradient(180deg, ${color}1f, rgba(14,16,22,0.97) 55%)`,
          boxShadow: lost ? "0 20px 60px -20px rgba(0,0,0,0.8)" : `0 0 60px -10px ${color}88, 0 20px 60px -20px rgba(0,0,0,0.8)`,
        }}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-colors"
          aria-label="Закрыть"
        >
          <X size={16} />
        </button>

        <h2
          className={`text-3xl font-black tracking-tight mb-5 ${lost ? "text-white/60" : "wheel-title-shine"}`}
          style={lost ? undefined : { backgroundImage: `linear-gradient(100deg, ${color} 20%, #ffffff 45%, ${color} 70%)` }}
        >
          {title}
        </h2>

        {/* Приз */}
        <div className="relative mx-auto mb-5 w-36 h-36">
          {SPARKLES.map((s, i) =>
            lost ? null : (
              <span key={i} className="wheel-sparkle absolute select-none" style={{ top: s.top, left: s.left, fontSize: s.size, color, animationDelay: s.delay }}>
                ✦
              </span>
            )
          )}
          <div
            className={`w-full h-full rounded-full overflow-hidden flex items-center justify-center bg-black/40 ${lost ? "wheel-shake" : "wheel-ring-pulse"}`}
            style={{ border: `3px solid ${color}`, "--c": `${color}88` } as React.CSSProperties}
          >
            {result.type === "product" && result.image ? (
              <img src={safeImageSrc(result.image)} alt={result.name} className="w-full h-full object-cover" />
            ) : isBalance ? (
              <span className="text-6xl">💰</span>
            ) : (
              <span className="text-6xl grayscale opacity-80">🚫</span>
            )}
          </div>
        </div>

        {lost ? (
          <>
            <p className="text-white/70 font-medium">{result.name}</p>
            <p className="text-xs text-white/40 mt-2 leading-relaxed">
              В этот раз колесо выбрало пустой сектор. {cooldownText ? `Следующая попытка через ${cooldownText}.` : "Возвращайся — удача любит упорных!"}
            </p>
          </>
        ) : isBalance ? (
          <>
            <p className="text-4xl font-black text-green-400 leading-none">
              +<CountUp to={result.balanceRub ?? 0} /> ₽
            </p>
            <p className="text-xs text-white/50 mt-2">Уже на твоём балансе</p>
          </>
        ) : (
          <>
            <p className="font-bold text-lg leading-tight">{result.name}</p>
            <span
              className="inline-block mt-2 text-[11px] font-bold px-2.5 py-0.5 rounded-full"
              style={{ color, background: `${color}22`, boxShadow: `inset 0 0 0 1px ${color}44` }}
            >
              {RARITY_LABEL[rar] ?? rar}
            </span>
            <p className="text-xs text-white/50 mt-3">Товар уже в твоих заказах!</p>
          </>
        )}

        <div className="mt-6 flex gap-2 justify-center">
          {result.type === "product" && result.orderId && onChat && (
            <button onClick={onChat} className="btn-primary px-4 py-2.5 text-sm inline-flex items-center gap-1.5">
              <MessageCircle size={15} /> Написать продавцу
            </button>
          )}
          <button onClick={onClose} className="btn-secondary px-5 py-2.5 text-sm">
            {lost ? "Понятно" : "Круто!"}
          </button>
        </div>
      </div>
    </div>
  );
}
