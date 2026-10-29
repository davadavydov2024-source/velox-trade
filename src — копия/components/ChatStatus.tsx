"use client";

import { useEffect, useState } from "react";
import { Check, CheckCheck, ImageIcon } from "lucide-react";

/** Галочки у своего сообщения: одна — отправлено, две — прочитано собеседником. */
export function MessageTicks({ read, tone = "dark" }: { read: boolean; tone?: "dark" | "light" }) {
  // dark — на яркой (акцентной) плашке своих сообщений, light — на тёмной.
  const readCls = tone === "dark" ? "text-black opacity-90" : "text-accent";
  const sentCls = tone === "dark" ? "text-black opacity-40" : "text-white/40";
  return read ? (
    <CheckCheck size={13} strokeWidth={2.5} className={`inline-block ml-1 -mt-0.5 ${readCls}`} aria-label="Прочитано" />
  ) : (
    <Check size={13} strokeWidth={2.5} className={`inline-block ml-1 -mt-0.5 ${sentCls}`} aria-label="Доставлено" />
  );
}

/** Подпись под самым последним своим сообщением — «Прочитано» / «Доставлено». */
export function ReadLabel({ read, className = "" }: { read: boolean; className?: string }) {
  return (
    <p className={`text-[10px] text-right mt-0.5 pr-1 ${read ? "text-accent" : "text-white/30"} ${className}`}>
      {read ? "Прочитано" : "Доставлено"}
    </p>
  );
}

/**
 * Пузырь «фото отправляется»: показывается сразу после выбора фото вместо пустого ожидания.
 * Превью размыто и «проявляется» по мере отправки, поверх бежит блик, по центру — кольцо с процентами.
 * Реального прогресса загрузки у нас нет (один fetch), поэтому процент плавно ползёт к ~92% и
 * замирает, пока сообщение не придёт — после этого пузырь заменяется настоящим сообщением.
 */
export function UploadingPhotoBubble({ src }: { src: string }) {
  const [progress, setProgress] = useState(4);
  const [dots, setDots] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setProgress((p) => p + (92 - p) * 0.07), 120);
    const dotsId = setInterval(() => setDots((d) => (d + 1) % 4), 380);
    return () => {
      clearInterval(id);
      clearInterval(dotsId);
    };
  }, []);

  const R = 20;
  const C = 2 * Math.PI * R;
  const pct = Math.round(progress);
  // По мере «загрузки» размытие уходит — фото как бы проявляется.
  const blur = Math.max(0, 7 - progress / 14);

  return (
    <div className="flex justify-end mt-2.5">
      <div className="max-w-[85%] sm:max-w-[75%] p-1.5 rounded-[20px] rounded-br-md bg-gradient-to-br from-accent to-accent-dark shadow-[0_6px_18px_-8px_var(--color-accent)]">
        <div className="relative overflow-hidden rounded-xl bg-black/30 min-w-[150px] min-h-[120px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt=""
            className="block max-h-[220px] max-w-full w-auto transition-[filter] duration-300"
            style={{ filter: `blur(${blur}px) brightness(0.75)`, transform: "scale(1.04)" }}
          />
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="upload-sweep absolute inset-y-0 w-1/2 bg-gradient-to-r from-transparent via-white/35 to-transparent" />
          </div>
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5">
            <div className="relative w-12 h-12">
              <svg viewBox="0 0 48 48" className="w-12 h-12 -rotate-90 drop-shadow-[0_0_8px_rgba(0,0,0,0.5)]">
                <circle cx="24" cy="24" r={R} fill="rgba(0,0,0,0.35)" stroke="rgba(255,255,255,0.25)" strokeWidth="3" />
                <circle
                  cx="24"
                  cy="24"
                  r={R}
                  fill="none"
                  stroke="#fff"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeDasharray={C}
                  strokeDashoffset={C * (1 - progress / 100)}
                  style={{ transition: "stroke-dashoffset 0.18s linear" }}
                />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-[11px] font-bold text-white tabular-nums">{pct}%</span>
            </div>
            <span className="upload-breathe flex items-center gap-1 text-[11px] font-medium text-white drop-shadow">
              <ImageIcon size={11} /> Отправка фото
              <span className="inline-block w-[1.1em] text-left">{".".repeat(dots)}</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
