"use client";

import { useCallback, useEffect, useState } from "react";
import { UserPlus, X } from "lucide-react";
import { authedFetch } from "@/lib/authedFetch";
import { useToast } from "@/lib/toastContext";
import { Spinner } from "./ui";

interface Worker { uid: string; handle?: string; displayName?: string; addedAt?: number }

/** Админ назначает «помощников по музыке»: они могут добавлять песни (массовая загрузка), но не удалять и не править каталог. */
export function MusicWorkersAdmin() {
  const { toast } = useToast();
  const [list, setList] = useState<Worker[] | null>(null);
  const [handle, setHandle] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await authedFetch("/api/admin/messenger/music-workers");
      const d = await r.json().catch(() => ({}));
      setList(r.ok ? d.workers ?? [] : []);
    } catch { setList([]); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const call = async (body: Record<string, unknown>) => {
    const r = await authedFetch("/api/admin/messenger/music-workers", { method: "POST", body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || "Ошибка");
  };
  const add = async () => {
    if (!handle.trim() || busy) return;
    setBusy(true);
    try { await call({ action: "add", handle }); setHandle(""); toast("success", "Помощник назначен"); await load(); }
    catch (e: any) { toast("error", e?.message || "Не удалось назначить"); }
    finally { setBusy(false); }
  };
  const remove = async (w: Worker) => {
    if (!confirm(`Снять @${w.handle ?? w.uid} с должности помощника?`)) return;
    try { await call({ action: "remove", uid: w.uid }); setList((a) => (a ?? []).filter((x) => x.uid !== w.uid)); }
    catch (e: any) { toast("error", e?.message || "Не удалось снять"); }
  };

  return (
    <>
      <p className="px-4 pt-5 pb-2 text-[13px] uppercase tracking-wide mx-muted">Помощники по музыке</p>
      <div className="px-4 flex flex-col gap-2.5">
        <div className="mx-card px-4 py-3 flex flex-col gap-2.5">
          <p className="text-[14px] mx-muted">Помощник видит в разделе «Музыка» кнопку «Добавить песни» и может загружать новые треки. Удалять, править и обрабатывать заявки он не может.</p>
          <div className="flex gap-2">
            <input className="mx-input flex-1" placeholder="@username пользователя" value={handle} onChange={(e) => setHandle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
            <button className="mx-btn flex items-center gap-1.5" style={{ width: "auto", padding: "0 14px" }} disabled={busy || !handle.trim()} onClick={add}>{busy ? <Spinner size={16} /> : <UserPlus size={17} />}Назначить</button>
          </div>
        </div>
        {list === null ? <div className="flex justify-center py-3"><Spinner size={20} /></div> : list.length > 0 && (
          <div className="mx-card">
            {list.map((w) => (
              <div key={w.uid} className="flex items-center gap-2 px-4 py-2.5">
                <span className="min-w-0 flex-1"><span className="block text-[15px] truncate">{w.displayName || w.handle}</span><span className="block text-[12.5px] mx-muted truncate">@{w.handle}</span></span>
                <button onClick={() => remove(w)} className="w-8 h-8 flex items-center justify-center mx-muted" aria-label="Снять"><X size={18} /></button>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
