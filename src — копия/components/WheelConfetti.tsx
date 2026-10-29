"use client";

import { useMemo } from "react";

const COLORS = ["#ffb700", "#ff5c8a", "#4a6cf7", "#4ade80", "#c084fc", "#ffffff"];

/** Разовый залп конфетти — монтируй с уникальным key при каждом новом результате, чтобы анимация перезапускалась. */
export function WheelConfetti() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 36 }, () => ({
        left: Math.random() * 100,
        delay: Math.random() * 0.25,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        cx: (Math.random() - 0.5) * 220,
        cr: 360 + Math.random() * 360,
        size: 5 + Math.random() * 5,
        round: Math.random() > 0.5,
      })),
    []
  );

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-20" aria-hidden>
      {pieces.map((p, i) => (
        <span
          key={i}
          className="wheel-confetti-piece absolute top-1/2"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size,
            background: p.color,
            borderRadius: p.round ? "50%" : "2px",
            animationDelay: `${p.delay}s`,
            // @ts-expect-error CSS custom properties
            "--cx": `${p.cx}px`,
            "--cr": `${p.cr}deg`,
          }}
        />
      ))}
    </div>
  );
}
