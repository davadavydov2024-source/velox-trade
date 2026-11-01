"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Settings2 } from "lucide-react";

type Line = { t: number; text: string };
type Style = { font: string; size: number; color: string; bold: boolean; align: "left" | "center" };

const FONTS: [string, string][] = [
  ["Обычный", "inherit"],
  ["С засечками", "Georgia, 'Times New Roman', serif"],
  ["Моно", "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"],
  ["Рукописный", "'Segoe Script', 'Bradley Hand', 'Comic Sans MS', cursive"],
  ["Узкий", "'Arial Narrow', 'Roboto Condensed', 'Helvetica Neue', sans-serif"],
];
const COLORS: [string, string][] = [["Авто", ""], ["Белый", "#ffffff"], ["Жёлтый", "#ffd60a"], ["Розовый", "#ff6fa5"], ["Голубой", "#64d2ff"], ["Зелёный", "#30d158"]];
const DEF: Style = { font: "inherit", size: 24, color: "", bold: true, align: "left" };
const KEY = "mx-lyrics-style";

function loadStyle(): Style {
  try { return { ...DEF, ...JSON.parse(localStorage.getItem(KEY) || "{}") }; } catch { return DEF; }
}

/** Разбор текста: строки с метками [мм:сс.xx] — точная синхронизация (формат LRC); без меток — приблизительная, равномерно по длине песни. */
function parse(text: string, duration: number): { lines: Line[]; synced: boolean } {
  const out: Line[] = [];
  let stamped = 0;
  for (const raw of text.split("\n")) {
    const tags = Array.from(raw.matchAll(/\[(\d{1,3}):(\d{1,2}(?:[.:]\d{1,3})?)\]/g));
    const body = raw.replace(/\[[^\]]*\]/g, "").trim();
    if (tags.length) { stamped++; for (const m of tags) out.push({ t: Number(m[1]) * 60 + Number(m[2].replace(":", ".")), text: body }); }
    else if (/^\[[a-z]+:.*\]$/i.test(raw.trim())) continue; // служебные теги [ar:..] [ti:..]
    else out.push({ t: -1, text: raw.trim() });
  }
  if (stamped >= 3) return { lines: out.filter((l) => l.t >= 0).sort((a, b) => a.t - b.t), synced: true };
  const rows = out.filter((l) => l.text);
  const step = duration > 0 && rows.length ? duration / rows.length : 0;
  return { lines: rows.map((l, i) => ({ t: step * i, text: l.text })), synced: false };
}

export function LyricsView({ text, time, duration, onSeek, className = "" }: { text: string; time: number; duration: number; onSeek: (s: number) => void; className?: string }) {
  const [st, setSt] = useState<Style>(DEF);
  const [panel, setPanel] = useState(false);
  useEffect(() => { setSt(loadStyle()); }, []);
  const upd = (p: Partial<Style>) => setSt((s) => { const n = { ...s, ...p }; try { localStorage.setItem(KEY, JSON.stringify(n)); } catch { /* без сохранения */ } return n; });

  const { lines, synced } = useMemo(() => parse(text, duration), [text, duration]);
  let idx = -1;
  for (let i = 0; i < lines.length; i++) { if (lines[i].t <= time + 0.25) idx = i; else break; }

  const box = useRef<HTMLDivElement>(null);
  const manual = useRef(0);
  useEffect(() => {
    const el = box.current?.querySelector<HTMLElement>(`[data-i="${idx}"]`);
    if (!el || !box.current || Date.now() - manual.current < 3000) return;
    box.current.scrollTo({ top: el.offsetTop - box.current.clientHeight / 2 + el.clientHeight / 2, behavior: "smooth" });
  }, [idx]);

  return (
    <div className={`relative flex flex-col min-h-0 ${className}`}>
      <div className="flex items-center justify-between px-1 pb-1 shrink-0">
        <span className="text-[12px] mx-muted">{synced ? "Текст синхронизирован" : "Приблизительное слежение"}</span>
        <button onClick={() => setPanel((v) => !v)} className="w-8 h-8 flex items-center justify-center rounded-full active:bg-white/10" aria-label="Настройки текста" style={{ color: panel ? "var(--mx-accent)" : undefined }}><Settings2 size={18} /></button>
      </div>

      {panel && (
        <div className="shrink-0 mb-2 rounded-2xl p-3 flex flex-col gap-2.5 text-[13.5px]" style={{ background: "color-mix(in srgb, var(--mx-bg) 80%, transparent)", backdropFilter: "blur(12px)" }} onClick={(e) => e.stopPropagation()}>
          <label className="flex items-center gap-3"><span className="w-20 mx-muted">Шрифт</span>
            <select className="mx-input flex-1" value={st.font} onChange={(e) => upd({ font: e.target.value })}>{FONTS.map(([n, v]) => <option key={n} value={v}>{n}</option>)}</select></label>
          <label className="flex items-center gap-3"><span className="w-20 mx-muted">Размер {st.size}</span>
            <input type="range" min={14} max={44} step={1} value={st.size} onChange={(e) => upd({ size: Number(e.target.value) })} className="flex-1" /></label>
          <div className="flex items-center gap-3"><span className="w-20 mx-muted">Цвет</span>
            <div className="flex gap-2 flex-wrap">{COLORS.map(([n, c]) => <button key={n} onClick={() => upd({ color: c })} aria-label={n} title={n} className="w-7 h-7 rounded-full text-[10px]" style={{ background: c || "var(--mx-text)", border: st.color === c ? "2px solid var(--mx-accent)" : "2px solid transparent", outline: "1px solid rgba(128,128,128,.4)" }} />)}</div></div>
          <div className="flex items-center gap-2">
            <button onClick={() => upd({ bold: !st.bold })} className="px-3 py-1.5 rounded-full font-semibold" style={{ background: st.bold ? "var(--mx-accent)" : "var(--mx-surface)", color: st.bold ? "#fff" : "var(--mx-text)" }}>Жирный</button>
            <button onClick={() => upd({ align: st.align === "left" ? "center" : "left" })} className="px-3 py-1.5 rounded-full font-semibold" style={{ background: "var(--mx-surface)" }}>{st.align === "left" ? "По левому краю" : "По центру"}</button>
            <button onClick={() => upd(DEF)} className="ml-auto mx-muted underline">Сбросить</button>
          </div>
        </div>
      )}

      <div ref={box} className="mx-scroll flex-1 min-h-0 overflow-y-auto px-1" style={{ fontFamily: st.font, WebkitOverflowScrolling: "touch", maskImage: "linear-gradient(180deg, transparent 0, #000 8%, #000 90%, transparent 100%)" }}
        onWheel={() => { manual.current = Date.now(); }} onTouchStart={(e) => { manual.current = Date.now(); e.stopPropagation(); }} onTouchMove={(e) => { manual.current = Date.now(); e.stopPropagation(); }}>
        <div className="py-[30%]">
          {lines.map((l, i) => (
            <p key={i} data-i={i} onClick={() => { if (duration > 0) { manual.current = 0; onSeek(l.t); } }} className="cursor-pointer" style={{ fontSize: st.size, fontWeight: st.bold ? 700 : 500, lineHeight: 1.3, textAlign: st.align, margin: "0 0 0.55em", color: st.color || undefined, opacity: i === idx ? 1 : 0.38, transform: i === idx ? "scale(1.02)" : "scale(1)", transformOrigin: st.align === "left" ? "left center" : "center", transition: "opacity .3s, transform .3s", minHeight: l.text ? undefined : "0.6em" }}>{l.text || " "}</p>
          ))}
        </div>
      </div>
    </div>
  );
}
