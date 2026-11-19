"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, Trash2 } from "lucide-react";
import { authedFetch } from "@/lib/authedFetch";
import { useToast } from "@/lib/toastContext";
import { Spinner } from "./ui";

interface Promo { code: string; days: number; maxUses: number; used: number; expiresAt: number; disabled: boolean }
async function call(body?: unknown): Promise<any> {
  const r = await authedFetch("/api/admin/messenger/promo", body === undefined ? undefined : { method: "POST", body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || "Ошибка");
  return d;
}

/** Промокоды: код даёт Mili Premium на N дней. Можно ограничить число активаций и срок. */
export function AdminPromo() {
  const { toast } = useToast();
  const [list, setList] = useState<Promo[] | null>(null);
  const [f, setF] = useState({ code: "", days: 7, maxUses: 100, expiresDays: 30 });
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { try { setList((await call()).codes); } catch (e: any) { toast("error", e.message); setList([]); } }, [toast]);
  useEffect(() => { load(); }, [load]);
  const create = async () => {
    setBusy(true);
    try { const d = await call({ action: "create", ...f }); toast("success", `Промокод ${d.code} создан`); setF({ ...f, code: "" }); await load(); } catch (e: any) { toast("error", e.message); } finally { setBusy(false); }
  };
  const copy = (c: string) => { navigator.clipboard?.writeText(c).then(() => toast("success", "Скопировано")).catch(() => {}); };
  const num = (k: "days" | "maxUses" | "expiresDays") => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: Number(e.target.value) || 0 });
  return (
    <>
      <p className="px-4 pt-3 pb-2 text-[13px] uppercase tracking-wide mx-muted">Новый промокод</p>
      <div className="px-4"><div className="mx-card px-4 py-3 flex flex-col gap-2.5">
        <input className="mx-input" placeholder="Код (пусто — создам случайный)" maxLength={32} value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} />
        <div className="grid grid-cols-3 gap-2 text-[12.5px] mx-muted">
          <label>Дней Premium<input type="number" className="mx-input mt-1" min={1} value={f.days} onChange={num("days")} /></label>
          <label>Активаций (0 — без лимита)<input type="number" className="mx-input mt-1" min={0} value={f.maxUses} onChange={num("maxUses")} /></label>
          <label>Действует дней (0 — вечно)<input type="number" className="mx-input mt-1" min={0} value={f.expiresDays} onChange={num("expiresDays")} /></label>
        </div>
        <button className="mx-btn" disabled={busy || f.days < 1} onClick={create}>{busy ? <Spinner size={18} /> : "Создать промокод"}</button>
      </div></div>
      <p className="px-4 pt-5 pb-2 text-[13px] uppercase tracking-wide mx-muted">Промокоды</p>
      <div className="px-4 flex flex-col gap-2 pb-6">
        {list === null ? <div className="flex justify-center py-4"><Spinner size={22} /></div> : list.length === 0 ? <p className="mx-muted text-[14px]">Пока нет промокодов.</p> : list.map((p) => {
          const dead = p.disabled || (p.expiresAt > 0 && p.expiresAt < Date.now()) || (p.maxUses > 0 && p.used >= p.maxUses);
          return (
            <div key={p.code} className="mx-card px-3 py-2.5 flex items-center gap-2" style={{ opacity: dead ? 0.55 : 1 }}>
              <div className="min-w-0 flex-1">
                <p className="text-[16px] font-semibold tracking-wider">{p.code}</p>
                <p className="text-[12.5px] mx-muted">+{p.days} дн. · использован {p.used}{p.maxUses ? ` из ${p.maxUses}` : ""}{p.expiresAt ? ` · до ${new Date(p.expiresAt).toLocaleDateString("ru-RU")}` : ""}{p.disabled ? " · выключен" : ""}</p>
              </div>
              <button onClick={() => copy(p.code)} className="w-8 h-8 flex items-center justify-center mx-muted" aria-label="Копировать"><Copy size={17} /></button>
              <button onClick={async () => { try { await call({ action: "disable", code: p.code, disabled: !p.disabled }); await load(); } catch (e: any) { toast("error", e.message); } }} className="px-2 h-8 text-[12.5px] mx-muted">{p.disabled ? "Включить" : "Выключить"}</button>
              <button onClick={async () => { if (!confirm(`Удалить промокод ${p.code}?`)) return; try { await call({ action: "delete", code: p.code }); await load(); } catch (e: any) { toast("error", e.message); } }} className="w-8 h-8 flex items-center justify-center" style={{ color: "var(--mx-danger)" }} aria-label="Удалить"><Trash2 size={17} /></button>
            </div>
          );
        })}
      </div>
    </>
  );
}
