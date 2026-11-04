"use client";

import { ReactNode, useId } from "react";
import { frameById } from "@/lib/messenger/frames";

const TAU = Math.PI * 2;
const pt = (r: number, a: number) => `${(Math.cos(a) * r).toFixed(2)},${(Math.sin(a) * r).toFixed(2)}`;
/** Псевдослучайное число по индексу — узор рамки одинаковый при каждой отрисовке. */
const rnd = (i: number, k = 1) => { const x = Math.sin(i * 127.1 * k + 311.7) * 43758.5453; return x - Math.floor(x); };

/** Рисует саму рамку в координатах -60..60 (аватарка занимает радиус 40). */
function FrameArt({ id, color }: { id: string; color: string }) {
  const gid = useId().replace(/:/g, "");
  if (id === "crown") {
    const spikes = Array.from({ length: 10 }, (_, i) => { const a = (i / 10) * TAU - Math.PI / 2; const w = 0.17; return `M${pt(43, a - w)} L${pt(57, a)} L${pt(43, a + w)} Z`; }).join(" ");
    return (
      <g>
        <defs><linearGradient id={gid} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fff6c8" /><stop offset="0.45" stopColor={color} /><stop offset="1" stopColor={color} stopOpacity="0.7" /></linearGradient></defs>
        <circle r="42.5" fill="none" stroke={`url(#${gid})`} strokeWidth="4" />
        <path d={spikes} fill={`url(#${gid})`} stroke="rgba(0,0,0,0.25)" strokeWidth="0.6" />
      </g>
    );
  }
  if (id === "night") {
    return (
      <g>
        <circle r="43" fill="none" stroke={color} strokeWidth="2.6" opacity="0.95" />
        <circle r="46.5" fill="none" stroke={color} strokeWidth="0.8" opacity="0.5" />
        {Array.from({ length: 16 }, (_, i) => { const a = (i / 16) * TAU + rnd(i) * 0.3; const r = 47 + rnd(i, 2) * 8; return <circle key={i} cx={Math.cos(a) * r} cy={Math.sin(a) * r} r={0.8 + rnd(i, 3) * 1.6} fill={color} opacity={0.5 + rnd(i, 4) * 0.5} />; })}
      </g>
    );
  }
  if (id === "ghoul") {
    const wave = (base: number, amp: number, n: number, ph: number) => Array.from({ length: 121 }, (_, i) => { const a = (i / 120) * TAU; const r = base + amp * Math.sin(n * a + ph); return `${i ? "L" : "M"}${pt(r, a)}`; }).join(" ") + " Z";
    return (
      <g>
        <path d={wave(46, 5, 7, 0)} fill="none" stroke={color} strokeWidth="4.2" strokeLinejoin="round" />
        <path d={wave(44, 3.5, 5, 1.4)} fill="none" stroke={color} strokeWidth="1.6" opacity="0.6" />
        <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="38s" repeatCount="indefinite" />
      </g>
    );
  }
  if (id === "laurel") {
    return (
      <g>
        <circle r="42" fill="none" stroke={color} strokeWidth="1.6" opacity="0.8" />
        {Array.from({ length: 22 }, (_, i) => { const a = (i / 22) * TAU; const r = i % 2 ? 47.5 : 45; const deg = (a * 180) / Math.PI + (i % 2 ? 35 : -35); return <ellipse key={i} cx={Math.cos(a) * r} cy={Math.sin(a) * r} rx="6.2" ry="2.5" fill={color} opacity={i % 2 ? 0.85 : 1} transform={`rotate(${deg} ${Math.cos(a) * r} ${Math.sin(a) * r})`} />; })}
      </g>
    );
  }
  if (id === "ocean") {
    return (
      <g>
        <circle r="43" fill="none" stroke={color} strokeWidth="3" />
        <g><circle r="48.5" fill="none" stroke={color} strokeWidth="2" strokeDasharray="7 5" opacity="0.8" /><animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="22s" repeatCount="indefinite" /></g>
        <g><circle r="53" fill="none" stroke={color} strokeWidth="1" strokeDasharray="2 6" opacity="0.5" /><animateTransform attributeName="transform" type="rotate" from="360" to="0" dur="30s" repeatCount="indefinite" /></g>
      </g>
    );
  }
  // rose: кольцо и «бутоны»-капли вокруг
  return (
    <g>
      <circle r="43" fill="none" stroke={color} strokeWidth="3.2" />
      {Array.from({ length: 18 }, (_, i) => { const a = (i / 18) * TAU + rnd(i) * 0.25; const r = 45 + rnd(i, 2) * 9; return <circle key={i} cx={Math.cos(a) * r} cy={Math.sin(a) * r} r={2 + rnd(i, 3) * 4} fill={color} opacity={0.55 + rnd(i, 4) * 0.45} />; })}
    </g>
  );
}

/** Аватарка в рамке: рамка рисуется поверх и чуть шире аватарки, клики проходят сквозь неё. */
export function AvatarFrame({ frame, size, children }: { frame?: { id: string; color: string } | null; size: number; children: ReactNode }) {
  const def = frameById(frame?.id);
  if (!frame || !def) return <>{children}</>;
  const box = size * 1.5;
  return (
    <span className="relative inline-block" style={{ width: size, height: size }}>
      {children}
      <svg viewBox="-60 -60 120 120" width={box} height={box} className="absolute pointer-events-none" style={{ left: -(box - size) / 2, top: -(box - size) / 2, filter: `drop-shadow(0 0 7px ${frame.color}88)` }} aria-hidden>
        <FrameArt id={def.id} color={frame.color} />
      </svg>
    </span>
  );
}
