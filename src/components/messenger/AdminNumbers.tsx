"use client";

import { useCallback, useEffect, useState } from "react";
import { Search, Trash2 } from "lucide-react";
import { authedFetch } from "@/lib/authedFetch";
import { useToast } from "@/lib/toastContext";
import { NUMBER_TIERS, analyzeNumber, formatNumber, isValidDigits, type NumberTier } from "@/lib/messenger/numbers";
import { Avatar, Spinner } from "./ui";
import { NumberTierChip } from "./Numbers";
import type { MAccount } from "./mtypes";

type Row = { digits: string; owner: string; ownerName: string; createdAt: number; tier: NumberTier };

async function call<T = any>(url: string, body?: unknown): Promise<T> {
  const res = await authedFetch(url, body === undefined ? undefined : { method: "POST", body: JSON.stringify(body) });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error || "Ошибка");
  return d as T;
}

/** Вкладка «Номера» в админ-панели: выдать красивый номер человеку (свой или случайный нужной редкости), забрать номер, список выданных. */
export function AdminNumbers() {
  const { toast } = useToast();
  const [q, setQ] = useState("");
  const [found, setFound] = useState<MAccount[]>([]);
  const [target, setTarget] = useState<MAccount | null>(null);
  const [digits, setDigits] = useState("");
  const [tier, setTier] = useState<NumberTier>("rare");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setRows((await call<{ numbers: Row[] }>("/api/admin/messenger/numbers")).numbers); } catch (e: any) { toast("error", e.message); setRows([]); }
  }, [toast]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const t = q.trim().replace(/^@/, "");
    if (t.length < 2) { setFound([]); return; }
    const id = setTimeout(() => { call<{ accounts: MAccount[] }>(`/api/admin/messenger?q=${encodeURIComponent(t)}`).then((d) => setFound(d.accounts.slice(0, 6))).catch(() => {}); }, 300);
    return () => clearTimeout(id);
  }, [q]);

  const grant = async () => {
    if (!target || busy) return;
    if (digits && !isValidDigits(digits)) { toast("error", "Номер — ровно 8 цифр"); return; }
    setBusy(true);
    try {
      const r = await call<{ digits: string; tier: NumberTier }>("/api/admin/messenger/numbers", { action: "grant", uid: target.uid, ...(digits ? { digits } : { tier }) });
      toast("success", `Выдан ${formatNumber(r.digits)}`);
      setDigits(""); load();
    } catch (e: any) { toast("error", e.message); } finally { setBusy(false); }
  };
  const revoke = async (r: Row) => {
    if (!confirm(`Забрать ${formatNumber(r.digits)} у ${r.ownerName}?`)) return;
    try { await call("/api/admin/messenger/numbers", { action: "revoke", digits: r.digits }); toast("success", "Номер забран"); load(); } catch (e: any) { toast("error", e.message); }
  };

  const preview = isValidDigits(digits) ? analyzeNumber(digits) : null;
  return (
    <div className="pb-10">
      <p className="px-4 pt-3 pb-2 text-[13px] uppercase tracking-wide mx-muted">Выдать номер</p>
      <div className="px-4 flex flex-col gap-2.5">
        {target ? (
          <div className="mx-card px-3 py-2.5 flex items-center gap-3">
            <Avatar src={target.photoURL} name={target.displayName} seed={target.uid} size={36} />
            <span className="flex-1 min-w-0"><span className="block truncate">{target.displayName}</span><span className="block text-[12.5px] mx-muted">@{target.handle}</span></span>
            <button className="text-[14px]" style={{ color: "var(--mx-accent)" }} onClick={() => setTarget(null)}>Сменить</button>
          </div>
        ) : (
          <>
            <div className="mx-search"><Search size={17} className="mx-muted shrink-0" /><input className="bg-transparent outline-none flex-1 text-[16px] min-w-0" placeholder="Кому: @username" value={q} onChange={(e) => setQ(e.target.value)} autoCapitalize="none" /></div>
            {found.map((a) => (
              <button key={a.uid} onClick={() => { setTarget(a); setQ(""); setFound([]); }} className="mx-card px-3 py-2 flex items-center gap-3 text-left">
                <Avatar src={a.photoURL} name={a.displayName} seed={a.uid} size={34} /><span className="min-w-0"><span className="block truncate">{a.displayName}</span><span className="block text-[12.5px] mx-muted">@{a.handle}</span></span>
              </button>
            ))}
          </>
        )}
        <input className="mx-input tabular-nums" inputMode="numeric" maxLength={8} placeholder="Свой номер: 8 цифр (необязательно)" value={digits} onChange={(e) => setDigits(e.target.value.replace(/\D/g, "").slice(0, 8))} />
        {preview ? (
          <p className="text-[13px] px-1" style={{ color: NUMBER_TIERS[preview.tier].color }}>{formatNumber(digits)} · {NUMBER_TIERS[preview.tier].label}{preview.reason ? ` (${preview.reason})` : ""}</p>
        ) : (
          <div>
            <p className="mx-muted text-[13px] px-1 mb-1.5">Или случайный номер редкости:</p>
            <div className="flex gap-1.5 flex-wrap">
              {(Object.keys(NUMBER_TIERS) as NumberTier[]).map((t) => (
                <button key={t} onClick={() => setTier(t)} className="px-3 h-8 rounded-lg text-[13.5px] font-medium" style={{ background: tier === t ? NUMBER_TIERS[t].color : "var(--mx-surface)", color: tier === t ? "#fff" : "var(--mx-text)" }}>{NUMBER_TIERS[t].label}</button>
              ))}
            </div>
          </div>
        )}
        <button className="mx-btn" onClick={grant} disabled={!target || busy}>{busy ? <Spinner size={18} /> : "Выдать номер"}</button>
      </div>

      <p className="px-4 pt-6 pb-1 text-[13px] uppercase tracking-wide mx-muted">Выданные номера</p>
      {rows === null ? <div className="flex justify-center py-6"><Spinner /></div> : rows.length === 0 ? <p className="mx-muted px-4 py-3 text-[14px]">Пока пусто</p> : rows.map((r) => (
        <div key={r.digits} className="px-4 py-2 flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[16px] font-semibold tabular-nums" style={{ color: r.tier === "common" ? undefined : NUMBER_TIERS[r.tier].color }}>{formatNumber(r.digits)}</p>
            <p className="mx-muted text-[12.5px] truncate">{r.ownerName}</p>
          </div>
          <NumberTierChip digits={r.digits} />
          <button className="w-9 h-9 flex items-center justify-center" style={{ color: "var(--mx-danger)" }} onClick={() => revoke(r)} aria-label="Забрать"><Trash2 size={17} /></button>
        </div>
      ))}
    </div>
  );
}
