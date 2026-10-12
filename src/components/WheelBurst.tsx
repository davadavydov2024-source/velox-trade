"use client";

import { useMemo } from "react";

type Variant = "confetti" | "coins" | "sad";

const CONFETTI = ["#ffb700", "#ff5c8a", "#4a6cf7", "#4ade80", "#c084fc", "#ffffff"];

/**
 * Полноэкранные частицы для экрана результата (монтируй с уникальным key — анимация играет один раз):
 *  • confetti — взрыв из центра вверх и в стороны, потом падение (цвета можно задать, например цветом редкости);
 *  • coins    — дождь монет сверху (выигрыш денег);
 *  • sad      — тихие серые капли (проигрыш).
 */
export function WheelBurst({ variant, count = 60, colors }: { variant: Variant; count?: number; colors?: string[] }) {
  const palette = colors && colors.length > 0 ? colors : CONFETTI;

  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const angle = Math.random() * Math.PI * 2;
        const power = 120 + Math.random() * 300;
        return {
          i,
          // confetti
          dx: Math.cos(angle) * power,
          dy: Math.sin(angle) * power * 0.7 - 160,
          rot: (Math.random() - 0.5) * 900,
          size: 6 + Math.random() * 7,
          color: palette[Math.floor(Math.random() * palette.length)],
          round: Math.random() > 0.55,
          // общие
          delay: variant === "confetti" ? Math.random() * 0.15 : Math.random() * (variant === "coins" ? 2.2 : 3),
          dur: variant === "confetti" ? 1.9 + Math.random() * 1.1 : 2.4 + Math.random() * 1.6,
          left: Math.random() * 100,
          sway: (Math.random() - 0.5) * 120,
          emoji: Math.random() > 0.35 ? "💰" : "🪙",
        };
      }),
    // palette намеренно не в зависимостях: состав задаётся при монтировании
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [count, variant]
  );

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
      {pieces.map((p) => {
        if (variant === "coins") {
          return (
            <span
              key={p.i}
              className="wheel-coin-piece absolute top-0 select-none"
              style={
                {
                  left: `${p.left}%`,
                  fontSize: 18 + p.size,
                  "--delay": `${p.delay}s`,
                  "--dur": `${p.dur + 1}s`,
                  "--sway": `${p.sway}px`,
                  "--rot": `${p.rot}deg`,
                } as React.CSSProperties
              }
            >
              {p.emoji}
            </span>
          );
        }
        if (variant === "sad") {
          return (
            <span
              key={p.i}
              className="wheel-sad-piece absolute top-0 rounded-full bg-slate-400/40"
              style={
                {
                  left: `${p.left}%`,
                  width: 2,
                  height: 10 + p.size,
                  "--delay": `${p.delay}s`,
                  "--dur": `${p.dur + 0.8}s`,
                } as React.CSSProperties
              }
            />
          );
        }
        return (
          <span
            key={p.i}
            className="wheel-burst-piece absolute left-1/2 top-1/2"
            style={
              {
                width: p.size,
                height: p.round ? p.size : p.size * 0.5,
                background: p.color,
                borderRadius: p.round ? "50%" : "2px",
                "--dx": `${p.dx}px`,
                "--dy": `${p.dy}px`,
                "--rot": `${p.rot}deg`,
                "--delay": `${p.delay}s`,
                "--dur": `${p.dur}s`,
              } as React.CSSProperties
            }
          />
        );
      })}
    </div>
  );
}
