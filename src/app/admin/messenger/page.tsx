"use client";

import { useCallback, useEffect, useState } from "react";
import { Search, ShieldBan, BadgeCheck, Flag } from "lucide-react";
import { authedFetch } from "@/lib/authedFetch";
import { useToast } from "@/lib/toastContext";
import { StickerAdmin } from "./StickerAdmin";
import { BroadcastAdmin } from "./BroadcastAdmin";

type Account = { uid: string; handle: string; displayName: string; banned?: boolean; verified?: boolean; createdAt: number; lastSeenAt: number };
type Report = { id: string; chatId: string; msgId: string; from: string; kind: string; textSnapshot?: string | null; reason: string; createdAt: number };
type Data = { stats: { accounts: number; chats: number; openReports: number }; accounts: Account[]; reports: Report[] };

export default function AdminMessengerPage() {
  const { toast } = useToast();
  const [data, setData] = useState<Data | null>(null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async (query = "") => {
    try {
      const res = await authedFetch(`/api/admin/messenger?q=${encodeURIComponent(query)}`);
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setData(d);
    } catch (e: any) {
      toast("error", e?.message || "Не удалось загрузить");
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  async function act(key: string, body: Record<string, unknown>, okText: string) {
    setBusy(key);
    try {
      const res = await authedFetch("/api/admin/messenger", { method: "POST", body: JSON.stringify(body) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      toast("success", okText);
      await load(q.trim());
    } catch (e: any) {
      toast("error", e?.message || "Не удалось выполнить");
    } finally {
      setBusy(null);
    }
  }

  const fmt = (t: number) => new Date(t).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Мессенджер</h1>
      {data && (
        <div className="grid grid-cols-3 gap-3">
          {[["Аккаунтов", data.stats.accounts], ["Чатов", data.stats.chats], ["Жалоб", data.stats.openReports]].map(([l, v]) => (
            <div key={l as string} className="card p-4 text-center"><p className="text-2xl font-bold">{v}</p><p className="text-xs text-white/40">{l}</p></div>
          ))}
        </div>
      )}

      <div className="card p-4 space-y-3">
        <p className="text-sm font-medium flex items-center gap-2"><Flag size={14} className="text-accent" /> Жалобы на сообщения</p>
        {!data || data.reports.length === 0 ? <p className="text-xs text-white/40">Открытых жалоб нет.</p> : data.reports.map((r) => (
          <div key={r.id} className="rounded-btn border border-border p-3 space-y-2">
            <p className="text-xs text-white/40">{fmt(r.createdAt)} · {r.kind} · автор {r.from}</p>
            {r.textSnapshot && <p className="text-sm break-words">«{r.textSnapshot}»</p>}
            <p className="text-xs text-yellow-300/80">Причина: {r.reason}</p>
            <div className="flex gap-2">
              <button disabled={busy === r.id} onClick={() => act(r.id, { action: "resolveReport", reportId: r.id, deleteMessage: true }, "Сообщение удалено")} className="btn-primary px-3 py-1.5 text-xs disabled:opacity-50">Удалить сообщение</button>
              <button disabled={busy === r.id} onClick={() => act(r.id, { action: "resolveReport", reportId: r.id }, "Жалоба закрыта")} className="btn-secondary px-3 py-1.5 text-xs disabled:opacity-50">Закрыть без удаления</button>
              <button disabled={busy === r.id} onClick={() => act(r.id + "b", { action: "ban", uid: r.from }, "Пользователь заблокирован")} className="px-3 py-1.5 text-xs text-red-300 border border-red-400/30 rounded-btn disabled:opacity-50">Бан автора</button>
            </div>
          </div>
        ))}
      </div>

      <form onSubmit={(e) => { e.preventDefault(); load(q.trim()); }} className="flex gap-2">
        <input autoComplete="off" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск по @username" className="input-field py-2.5 text-sm flex-1" />
        <button className="btn-secondary px-4 py-2.5 text-sm flex items-center gap-2"><Search size={14} /> Найти</button>
      </form>
      <div className="space-y-2">
        {data?.accounts.map((a) => (
          <div key={a.uid} className="card p-3 flex items-center justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <p className="text-sm font-medium">{a.displayName} <span className="text-white/40">@{a.handle}</span>{a.verified && <BadgeCheck size={14} className="inline ml-1 text-accent" />}{a.banned && <span className="ml-2 text-[11px] text-red-300">заблокирован</span>}</p>
              <p className="text-[11px] text-white/30">создан {fmt(a.createdAt)} · был {fmt(a.lastSeenAt)}</p>
            </div>
            <div className="flex gap-2">
              <button disabled={busy === a.uid} onClick={() => act(a.uid, { action: a.verified ? "unverify" : "verify", uid: a.uid }, "Готово")} className="btn-secondary px-3 py-1.5 text-xs disabled:opacity-50">{a.verified ? "Снять галочку" : "Галочка"}</button>
              <button disabled={busy === a.uid} onClick={() => act(a.uid, { action: "grantPremium", uid: a.uid, days: 30 }, "Mili Premium +30 дней")} className="btn-secondary px-3 py-1.5 text-xs disabled:opacity-50">⭐ +30 дн.</button>
              <button disabled={busy === a.uid} onClick={() => act(a.uid, { action: a.banned ? "unban" : "ban", uid: a.uid }, a.banned ? "Разблокирован" : "Заблокирован")} className="px-3 py-1.5 text-xs border border-red-400/30 text-red-300 rounded-btn flex items-center gap-1 disabled:opacity-50"><ShieldBan size={12} />{a.banned ? "Разбан" : "Бан"}</button>
            </div>
          </div>
        ))}
      </div>
      <BroadcastAdmin />
      <StickerAdmin />
    </div>
  );
}
