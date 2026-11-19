"use client";

import { useEffect, useState } from "react";
import { Moon } from "lucide-react";
import { authedFetch } from "@/lib/authedFetch";
import { useToast } from "@/lib/toastContext";
import { Switch } from "./ui";

const hm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const toMin = (s: string) => { const [h, m] = s.split(":").map(Number); return (h || 0) * 60 + (m || 0); };

/** «Тихие часы»: в выбранное время пуш-уведомления не приходят (упоминания @ — приходят). */
export function QuietHoursCard() {
  const { toast } = useToast();
  const [q, setQ] = useState({ enabled: false, from: 23 * 60, to: 8 * 60 });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    authedFetch("/api/messenger/quiet-hours").then((r) => (r.ok ? r.json() : null)).then((d) => { if (d?.quiet) setQ({ enabled: !!d.quiet.enabled, from: d.quiet.from, to: d.quiet.to }); }).catch(() => {}).finally(() => setReady(true));
  }, []);

  const save = async (n: typeof q) => {
    setQ(n);
    try {
      const r = await authedFetch("/api/messenger/quiet-hours", { method: "POST", body: JSON.stringify({ ...n, tz: -new Date().getTimezoneOffset() }) });
      if (!r.ok) throw new Error();
    } catch { toast("error", "Не удалось сохранить тихие часы"); }
  };

  return (
    <div className="mx-card px-4 py-3 flex flex-col gap-2.5">
      <div className="flex items-center gap-3">
        <span className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "#5856d6", color: "#fff" }}><Moon size={18} /></span>
        <span className="flex-1 min-w-0"><span className="block text-[15.5px] font-medium">Тихие часы</span><span className="block text-[12.5px] mx-muted">Без уведомлений по расписанию</span></span>
        <Switch on={q.enabled} disabled={!ready} onChange={(v) => save({ ...q, enabled: v })} />
      </div>
      {q.enabled && (
        <div className="flex items-center gap-2 text-[14px]">
          <span className="mx-muted">С</span><input type="time" className="mx-input" style={{ width: "auto", padding: "6px 10px" }} value={hm(q.from)} onChange={(e) => e.target.value && save({ ...q, from: toMin(e.target.value) })} />
          <span className="mx-muted">до</span><input type="time" className="mx-input" style={{ width: "auto", padding: "6px 10px" }} value={hm(q.to)} onChange={(e) => e.target.value && save({ ...q, to: toMin(e.target.value) })} />
        </div>
      )}
      {q.enabled && <p className="mx-muted text-[12px]">Сообщения придут как обычно, но звука и пуша не будет. Если вас упомянут через @, уведомление всё равно придёт.</p>}
    </div>
  );
}
