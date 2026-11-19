"use client";

import { useEffect, useState } from "react";
import { authedFetch } from "@/lib/authedFetch";
import { Spinner } from "./ui";

interface G { days: { date: string; count: number }[]; total: number; premium: number; tracks: number; ads: number }

/** Рост: новые пользователи по дням за 2 недели и главные цифры проекта. */
export function AdminGrowth() {
  const [g, setG] = useState<G | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    authedFetch("/api/admin/messenger/growth").then(async (r) => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || "Ошибка"); setG(d); }).catch((e) => setErr(e.message));
  }, []);
  if (err) return <p className="px-4 pt-4 text-[14px]" style={{ color: "var(--mx-danger)" }}>{err}</p>;
  if (!g) return <div className="flex justify-center py-8"><Spinner size={24} /></div>;
  const max = Math.max(1, ...g.days.map((d) => d.count));
  const week = g.days.slice(7).reduce((s, d) => s + d.count, 0), prev = g.days.slice(0, 7).reduce((s, d) => s + d.count, 0);
  const tiles: [string, string | number][] = [["Всего пользователей", g.total], ["С Mili Premium", g.premium], ["Песен в каталоге", g.tracks], ["Активной рекламы", g.ads]];
  return (
    <>
      <p className="px-4 pt-3 pb-2 text-[13px] uppercase tracking-wide mx-muted">Новые пользователи · 14 дней</p>
      <div className="px-4"><div className="mx-card px-4 py-4">
        <div className="flex items-end gap-1.5" style={{ height: 120 }}>
          {g.days.map((d) => (
            <div key={d.date} className="flex-1 flex flex-col items-center justify-end h-full gap-1" title={`${d.date}: ${d.count}`}>
              <span className="text-[10px] mx-muted tabular-nums">{d.count || ""}</span>
              <div className="w-full rounded-t-md" style={{ height: `${Math.max(3, (d.count / max) * 88)}px`, background: "var(--mx-accent)", opacity: d.count ? 1 : 0.25 }} />
            </div>
          ))}
        </div>
        <div className="flex gap-1.5 mt-1.5">{g.days.map((d, i) => <span key={d.date} className="flex-1 text-center text-[9.5px] mx-muted">{i % 2 === 0 ? d.date.slice(3) : ""}</span>)}</div>
        <p className="text-[13px] mx-muted mt-3">За последние 7 дней: <b style={{ color: "var(--mx-text)" }}>{week}</b> {prev ? `(${week >= prev ? "+" : ""}${Math.round(((week - prev) / prev) * 100)}% к прошлой неделе)` : ""}</p>
      </div></div>
      <div className="px-4 pt-3 pb-6 grid grid-cols-2 gap-2.5">
        {tiles.map(([l, v]) => <div key={l} className="mx-card px-4 py-3"><p className="text-[24px] font-bold tabular-nums">{v}</p><p className="text-[12.5px] mx-muted">{l}</p></div>)}
      </div>
    </>
  );
}
