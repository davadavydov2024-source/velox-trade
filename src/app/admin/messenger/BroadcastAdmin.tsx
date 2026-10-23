"use client";

import { useCallback, useEffect, useState } from "react";
import { Megaphone } from "lucide-react";
import { authedFetch } from "@/lib/authedFetch";
import { useToast } from "@/lib/toastContext";

type Past = { id: string; text: string; target: string; sent: number; createdAt: number; done: boolean };
const TARGETS = [["all", "Всем"], ["premium", "Только Mili Premium"], ["verified", "Только с галочкой"]];

/** Рассылка от имени «MiliGram Push» (служебный чат у каждого пользователя + пуш). */
export function BroadcastAdmin() {
  const { toast } = useToast();
  const [text, setText] = useState("");
  const [target, setTarget] = useState("all");
  const [silent, setSilent] = useState(false);
  const [running, setRunning] = useState(false);
  const [sent, setSent] = useState(0);
  const [past, setPast] = useState<Past[]>([]);

  const loadPast = useCallback(async () => {
    const res = await authedFetch("/api/admin/messenger/broadcast");
    const d = await res.json();
    if (res.ok) setPast(d.broadcasts);
  }, []);
  useEffect(() => { loadPast().catch(() => {}); }, [loadPast]);

  async function start() {
    if (!text.trim()) return toast("warning", "Напиши текст рассылки");
    if (!confirm(`Отправить рассылку (${TARGETS.find((t) => t[0] === target)?.[1]})? Остановить её после старта нельзя.`)) return;
    setRunning(true);
    setSent(0);
    let id = "";
    let cursor: number | null = null;
    let total = 0;
    try {
      for (;;) {
        const res: Response = await authedFetch("/api/admin/messenger/broadcast", { method: "POST", body: JSON.stringify({ text, target, silent, broadcastId: id || undefined, cursor }) });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error);
        id = d.broadcastId;
        cursor = d.nextCursor;
        total += d.sent;
        setSent(total);
        if (d.done) break;
      }
      toast("success", `Рассылка завершена: доставлено ${total}`);
      setText("");
      await loadPast();
    } catch (e: any) {
      toast("error", e?.message || "Рассылка прервалась — повторить можно с новым запуском");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="card p-4 space-y-3">
      <p className="text-sm font-medium flex items-center gap-2"><Megaphone size={14} className="text-accent" /> Рассылка от «MiliGram Push»</p>
      <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={3500} placeholder="Текст рассылки (до 3500 символов)" className="input-field py-2 text-sm w-full min-h-[100px]" />
      <div className="flex gap-3 flex-wrap items-center">
        <select value={target} onChange={(e) => setTarget(e.target.value)} className="input-field py-2 text-sm max-w-[240px]">
          {TARGETS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm text-white/70"><input autoComplete="off" type="checkbox" checked={silent} onChange={(e) => setSilent(e.target.checked)} /> Без пуша (только в чат)</label>
      </div>
      <button onClick={start} disabled={running} className="btn-primary px-5 py-2 text-sm disabled:opacity-50">{running ? `Отправляю… доставлено ${sent}` : "Отправить рассылку"}</button>
      <div className="space-y-1.5 pt-2 border-t border-border">
        {past.map((p) => (
          <p key={p.id} className="text-xs text-white/50 truncate">{new Date(p.createdAt).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" })} · {p.target} · доставлено {p.sent}{p.done ? "" : " (не закончена)"} · «{p.text}»</p>
        ))}
      </div>
    </div>
  );
}
