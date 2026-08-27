"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useMascot, MascotEvent } from "@/lib/mascotContext";

interface EventConfig {
  title: string;
  subtitle: string;
  accent: string; // цвет свечения/частиц под конкретное событие
  flip: boolean; // зеркалим дракона — "смотрит" в другую сторону
  tiltDeg: number; // лёгкий наклон для другого "настроения" позы
  enterFrom: "left" | "right" | "bottom";
  particle: "sparkle" | "confetti" | "hearts";
}

const EVENT_CONFIG: Record<MascotEvent, EventConfig> = {
  register: {
    title: "Добро пожаловать в стаю! 🐉",
    subtitle: "Регистрация прошла успешно",
    accent: "#4a6cf7",
    flip: false,
    tiltDeg: -2,
    enterFrom: "left",
    particle: "sparkle",
  },
  purchase: {
    title: "Отличная покупка!",
    subtitle: "Заказ оформлен — жди предмет",
    accent: "#ffb020",
    flip: true,
    tiltDeg: 2,
    enterFrom: "right",
    particle: "confetti",
  },
  sale: {
    title: "Ура, у тебя купили предмет!",
    subtitle: "Новая продажа на площадке",
    accent: "#22c55e",
    flip: false,
    tiltDeg: -3,
    enterFrom: "bottom",
    particle: "hearts",
  },
};

const AUTO_DISMISS_MS = 4800;

function useParticles(seed: number, kind: EventConfig["particle"]) {
  return useMemo(() => {
    // Детерминированный "случайный" разброс на основе seed — чтобы частицы не прыгали
    // при каждом ре-рендере, но были разными при каждом новом появлении маскота.
    let s = seed * 9301 + 49297;
    const rand = () => {
      s = (s * 9301 + 49297) % 233280;
      return s / 233280;
    };
    const glyphs = kind === "confetti" ? ["✦", "✧", "●", "▲"] : kind === "hearts" ? ["♥", "✦", "•"] : ["✦", "✧", "•", "+"];
    return Array.from({ length: 14 }).map((_, i) => ({
      id: i,
      left: rand() * 100,
      delay: rand() * 0.5,
      duration: 1.4 + rand() * 1.2,
      size: 10 + rand() * 14,
      drift: (rand() - 0.5) * 120,
      glyph: glyphs[Math.floor(rand() * glyphs.length)],
    }));
  }, [seed, kind]);
}

function MascotPopup({ event, id }: { event: MascotEvent; id: number }) {
  const cfg = EVENT_CONFIG[event];
  const particles = useParticles(id, cfg.particle);
  const [closing, setClosing] = useState(false);
  const { dismiss } = useMascot();

  useEffect(() => {
    setClosing(false);
    const closeTimer = setTimeout(() => setClosing(true), AUTO_DISMISS_MS);
    const removeTimer = setTimeout(() => dismiss(), AUTO_DISMISS_MS + 450);
    return () => {
      clearTimeout(closeTimer);
      clearTimeout(removeTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const enterAnim =
    cfg.enterFrom === "left" ? "mascot-enter-left" : cfg.enterFrom === "right" ? "mascot-enter-right" : "mascot-enter-bottom";

  return (
    <div
      className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-[200] flex items-end gap-3 pointer-events-none select-none"
      style={{ maxWidth: "min(420px, calc(100vw - 2rem))" }}
    >
      {/* Частицы */}
      <div className="absolute inset-0 overflow-visible">
        {particles.map((p) => (
          <span
            key={p.id}
            className="absolute font-bold"
            style={{
              left: `${p.left}%`,
              bottom: 0,
              color: cfg.accent,
              fontSize: p.size,
              opacity: 0,
              animation: `mascot-particle-float ${p.duration}s ease-out ${p.delay}s forwards`,
              // @ts-ignore -- кастомное CSS-свойство для дрейфа частицы по X
              "--drift": `${p.drift}px`,
            }}
          >
            {p.glyph}
          </span>
        ))}
      </div>

      <div
        className={`relative pointer-events-auto ${closing ? "mascot-exit" : enterAnim}`}
        style={{ filter: `drop-shadow(0 0 28px ${cfg.accent}55)` }}
      >
        {/* Свечение под маскотом */}
        <div
          className="absolute -inset-6 rounded-full blur-2xl mascot-glow-pulse"
          style={{ background: `radial-gradient(circle, ${cfg.accent}40, transparent 70%)` }}
        />

        {/* Речевой пузырь */}
        <div
          className="relative mb-2 mr-2 ml-auto card px-4 py-3 max-w-[260px] shadow-lg"
          style={{ borderColor: `${cfg.accent}55` }}
        >
          <p className="text-sm font-semibold leading-snug">{cfg.title}</p>
          <p className="text-xs text-white/50 mt-0.5">{cfg.subtitle}</p>
          <div
            className="absolute -bottom-2 right-8 w-4 h-4 rotate-45 bg-surface border-r border-b"
            style={{ borderColor: `${cfg.accent}55` }}
          />
        </div>

        <div
          className="relative w-32 h-32 sm:w-40 sm:h-40 mascot-float"
          style={{ transform: `rotate(${cfg.tiltDeg}deg) ${cfg.flip ? "scaleX(-1)" : ""}` }}
        >
          <Image src="/mascot/dragon-duo.webp" alt="Маскот Velox Trade" fill className="object-contain" sizes="160px" priority />
        </div>
      </div>
    </div>
  );
}

/** Смонтируй один раз в корневом layout — сам следит за состоянием MascotContext. */
export function MascotCelebration() {
  const { state } = useMascot();
  if (!state) return null;
  return <MascotPopup key={state.key} event={state.event} id={state.key} />;
}
