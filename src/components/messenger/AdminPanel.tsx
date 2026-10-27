"use client";

import { useCallback, useEffect, useState } from "react";
import { BadgeCheck, Ban, Megaphone, ShieldAlert, Star } from "lucide-react";
import { authedFetch } from "@/lib/authedFetch";
import { useToast } from "@/lib/toastContext";
import { Avatar, PageHeader, Spinner } from "./ui";
import type { MAccount } from "./mtypes";

type Stats = { accounts: number; chats: number; openReports: number; premium: number; gifts: number; stickerPacks: number };
type Report = { id: string; reporterUid: string; chatId: string; msgId: string; from: string; kind: string; textSnapshot?: string; reason: string; createdAt: number };
type ReadMsg = { id: string; from: string; kind: string; text: string; mediaUrl: string | null; createdAt: number; deleted: boolean };
type ReadResult = { chat: { id: string; type: string; title: string | null }; messages: ReadMsg[]; accounts: Record<string, { displayName: string; handle: string }>; highlightAt: number | null };
type Past = { id: string; text: string; target: string; sent: number; createdAt: number; done: boolean };
const TARGETS: [string, string][] = [["all", "Всем"], ["premium", "Только Mili Premium"], ["verified", "Только с галочкой"]];
const TABS = [["stats", "Обзор"], ["broadcast", "Рассылка"], ["users", "Люди"], ["reports", "Жалобы"], ["chats", "Чаты"], ["stickers", "Стикеры"]] as const;
type Tab = (typeof TABS)[number][0];

async function call<T = any>(url: string, body?: unknown): Promise<T> {
  const res = await authedFetch(url, body === undefined ? undefined : { method: "POST", body: JSON.stringify(body) });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error || "Ошибка");
  return d as T;
}

/** Админ-панель внутри мессенджера: обзор, рассылка от «MiliGram Push», люди (бан/галочка/Premium), жалобы. Видна только админам сайта. */
export function AdminPanel({ onBack }: { onBack: () => void }) {
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>("stats");
  const [stats, setStats] = useState<Stats | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [people, setPeople] = useState<MAccount[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);

  // рассылка
  const [text, setText] = useState("");
  const [target, setTarget] = useState("all");
  const [silent, setSilent] = useState(false);
  const [running, setRunning] = useState(false);
  const [sent, setSent] = useState(0);
  const [past, setPast] = useState<Past[]>([]);

  // чтение переписки (только по жалобе или с указанием причины; всё пишется в журнал)
  const [ra, setRa] = useState("");
  const [rb, setRb] = useState("");
  const [rChat, setRChat] = useState("");
  const [reason, setReason] = useState("");
  const [reading, setReading] = useState(false);
  const [read, setRead] = useState<ReadResult | null>(null);
  const [audit, setAudit] = useState<{ adminUid: string; chatId?: string; reason?: string; at: number }[]>([]);
  const openChat = async (qs: string) => {
    setReading(true);
    try { setRead(await call<ReadResult>(`/api/admin/messenger/chats?${qs}`)); setTab("chats"); call<{ audit: any[] }>("/api/admin/messenger/chats?audit=1").then((d) => setAudit(d.audit)).catch(() => {}); } catch (e: any) { toast("error", e.message); } finally { setReading(false); }
  };

  const load = useCallback(async (query = "") => {
    setLoading(true);
    try {
      const d = await call<{ stats: Stats; accounts: MAccount[]; reports: Report[] }>(`/api/admin/messenger?q=${encodeURIComponent(query)}`);
      setStats(d.stats); setPeople(d.accounts); setReports(d.reports);
    } catch (e: any) { toast("error", e.message); } finally { setLoading(false); }
  }, [toast]);
  const loadPast = useCallback(() => call<{ broadcasts: Past[] }>("/api/admin/messenger/broadcast").then((d) => setPast(d.broadcasts)).catch(() => {}), []);
  useEffect(() => { load(); loadPast(); }, [load, loadPast]);

  const act = async (body: Record<string, unknown>, ok: string) => {
    try { await call("/api/admin/messenger", body); toast("success", ok); load(q); } catch (e: any) { toast("error", e.message); }
  };

  const start = async () => {
    if (!text.trim()) return toast("warning", "Напиши текст рассылки");
    if (!confirm(`Отправить рассылку (${TARGETS.find((t) => t[0] === target)?.[1]})? Остановить после старта нельзя.`)) return;
    setRunning(true); setSent(0);
    let id = ""; let cursor: number | null = null; let total = 0;
    try {
      for (;;) {
        const d: any = await call("/api/admin/messenger/broadcast", { text, target, silent, broadcastId: id || undefined, cursor });
        id = d.broadcastId; cursor = d.nextCursor; total += d.sent; setSent(total);
        if (d.done) break;
      }
      toast("success", `Рассылка завершена: доставлено ${total}`);
      setText(""); loadPast();
    } catch (e: any) { toast("error", e.message || "Рассылка прервалась"); } finally { setRunning(false); }
  };

  const stat = (label: string, v: number | undefined) => (
    <div className="mx-card px-4 py-3"><p className="text-[26px] font-bold leading-none">{v ?? "…"}</p><p className="mx-muted text-[13px] mt-1">{label}</p></div>
  );

  return (
    <>
      <PageHeader title="Админ-панель" onBack={onBack} />
      <div className="px-4 pt-3 shrink-0">
        <div className="flex gap-1 p-1 rounded-full overflow-x-auto mx-noscrollbar" style={{ background: "var(--mx-surface2)" }}>
          {TABS.map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)} className="flex-1 shrink-0 px-3.5 py-2 rounded-full text-[14px] font-semibold whitespace-nowrap" style={{ background: tab === id ? "var(--mx-surface)" : "transparent", color: tab === id ? "var(--mx-text)" : "var(--mx-muted)" }}>{label}{id === "reports" && stats?.openReports ? ` ${stats.openReports}` : ""}</button>
          ))}
        </div>
      </div>

      <div className="mx-scroll flex-1 pt-4 pb-24 px-4 space-y-4">
        {tab === "stats" && (
          <div className="grid grid-cols-2 gap-3">
            {stat("аккаунтов", stats?.accounts)}{stat("с Mili Premium", stats?.premium)}
            {stat("чатов", stats?.chats)}{stat("подарков отправлено", stats?.gifts)}
            {stat("наборов стикеров", stats?.stickerPacks)}{stat("открытых жалоб", stats?.openReports)}
          </div>
        )}

        {tab === "broadcast" && (
          <>
            <div className="mx-card p-4 space-y-3">
              <p className="font-semibold flex items-center gap-2"><Megaphone size={16} style={{ color: "var(--mx-accent)" }} /> Рассылка от «MiliGram Push»</p>
              <textarea className="mx-input w-full" rows={5} maxLength={3500} placeholder="Текст рассылки (до 3500 символов)" value={text} onChange={(e) => setText(e.target.value)} />
              <select className="mx-input w-full" value={target} onChange={(e) => setTarget(e.target.value)}>{TARGETS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
              <label className="flex items-center gap-2 text-[14.5px]"><input type="checkbox" checked={silent} onChange={(e) => setSilent(e.target.checked)} /> Без пуша (только в чат)</label>
              <button className="mx-btn w-full" onClick={start} disabled={running}>{running ? `Отправляю… доставлено ${sent}` : "Отправить рассылку"}</button>
            </div>
            {past.length > 0 && (
              <div className="mx-card">
                <p className="px-4 pt-3 pb-1 text-[13px] uppercase tracking-wide mx-muted">Прошлые рассылки</p>
                {past.map((p) => <p key={p.id} className="px-4 py-2 text-[13px] mx-muted truncate">{new Date(p.createdAt).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" })} · {p.target} · {p.sent}{p.done ? "" : " (не закончена)"} · «{p.text}»</p>)}
              </div>
            )}
          </>
        )}

        {tab === "users" && (
          <>
            <input className="mx-input w-full" placeholder="Поиск по @username (от 2 символов)" value={q} onChange={(e) => { setQ(e.target.value); if (e.target.value.trim().length >= 2 || !e.target.value.trim()) load(e.target.value.trim()); }} autoCapitalize="none" />
            {loading && <div className="flex justify-center"><Spinner /></div>}
            <div className="mx-card">
              {people.map((a) => (
                <div key={a.uid} className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Avatar src={a.photoURL} name={a.displayName} seed={a.uid} size={42} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{a.displayName} {a.verified && <BadgeCheck size={14} className="inline" style={{ color: "var(--mx-accent)" }} />}{a.banned && <span className="text-[12px] ml-1" style={{ color: "var(--mx-danger)" }}>забанен</span>}</p>
                      <p className="mx-muted text-[12.5px]">@{a.handle}{a.premiumUntil && a.premiumUntil > Date.now() ? ` · Premium до ${new Date(a.premiumUntil).toLocaleDateString("ru-RU")}` : ""}</p>
                    </div>
                  </div>
                  <div className="flex gap-1.5 mt-2 flex-wrap">
                    <button className="mx-chip" onClick={() => act({ action: a.banned ? "unban" : "ban", uid: a.uid }, a.banned ? "Разбанен" : "Забанен")}><Ban size={14} /> {a.banned ? "Разбан" : "Бан"}</button>
                    <button className="mx-chip" onClick={() => act({ action: a.verified ? "unverify" : "verify", uid: a.uid }, "Готово")}><BadgeCheck size={14} /> {a.verified ? "Снять галочку" : "Галочка"}</button>
                    <button className="mx-chip" onClick={() => act({ action: "grantPremium", uid: a.uid, days: 30 }, "Premium +30 дн.")}><Star size={14} /> +30 дн.</button>
                  </div>
                </div>
              ))}
              {!loading && people.length === 0 && <p className="mx-muted px-4 py-4 text-[14px]">Никого не найдено</p>}
            </div>
          </>
        )}

        {tab === "reports" && (
          reports.length === 0 ? <p className="mx-muted text-center py-8">Открытых жалоб нет 🎉</p> : (
            <div className="mx-card">
              {reports.map((r) => (
                <div key={r.id} className="px-4 py-3">
                  <p className="text-[12.5px] mx-muted flex items-center gap-1"><ShieldAlert size={13} /> {r.reason} · {new Date(r.createdAt).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" })}</p>
                  <p className="mt-1 text-[14.5px] whitespace-pre-wrap break-words">{r.textSnapshot || `[${r.kind}]`}</p>
                  <div className="flex gap-1.5 mt-2">
                    <button className="mx-chip" onClick={() => openChat(`reportId=${encodeURIComponent(r.id)}`)}>Контекст</button>
                    <button className="mx-chip" onClick={() => act({ action: "resolveReport", reportId: r.id, deleteMessage: true }, "Сообщение удалено, жалоба закрыта")}>Удалить сообщение</button>
                    <button className="mx-chip" onClick={() => act({ action: "resolveReport", reportId: r.id }, "Жалоба закрыта")}>Закрыть</button>
                    <button className="mx-chip" onClick={() => act({ action: "ban", uid: r.from }, "Автор забанен")}><Ban size={14} /> Бан автора</button>
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {tab === "chats" && (
          <>
            <div className="mx-card p-4 space-y-3">
              <p className="font-semibold flex items-center gap-2"><ShieldAlert size={16} style={{ color: "var(--mx-accent)" }} /> Чтение переписки для безопасности</p>
              <p className="mx-muted text-[13px] leading-snug">Доступ только по жалобе («Контекст» в жалобах) или с указанием причины. Каждое открытие записывается в журнал вместе с причиной и описано в Политике конфиденциальности. «Избранное» и служебные чаты не открываются.</p>
              <div className="flex gap-2">
                <input className="mx-input flex-1" placeholder="@user1" value={ra} onChange={(e) => setRa(e.target.value)} autoCapitalize="none" />
                <input className="mx-input flex-1" placeholder="@user2" value={rb} onChange={(e) => setRb(e.target.value)} autoCapitalize="none" />
              </div>
              <input className="mx-input w-full" placeholder="или chatId группы/канала" value={rChat} onChange={(e) => setRChat(e.target.value)} autoCapitalize="none" />
              <textarea className="mx-input w-full" rows={2} maxLength={300} placeholder="Причина доступа (от 10 символов): например, «подозрение на мошенничество, обращение №123»" value={reason} onChange={(e) => setReason(e.target.value)} />
              <button className="mx-btn w-full" disabled={reading || reason.trim().length < 10 || !((ra && rb) || rChat)} onClick={() => openChat(`${ra && rb ? `a=${encodeURIComponent(ra)}&b=${encodeURIComponent(rb)}` : `chatId=${encodeURIComponent(rChat.trim())}`}&reason=${encodeURIComponent(reason.trim())}`)}>{reading ? <Spinner size={18} /> : "Открыть переписку"}</button>
            </div>
            {read && (
              <div className="mx-card">
                <p className="px-4 pt-3 pb-1 text-[13px] uppercase tracking-wide mx-muted">{read.chat.title ?? (read.chat.type === "dm" ? "Личный чат" : read.chat.type)} · {read.messages.length} сообщ. · только чтение</p>
                {read.messages.length === 0 && <p className="mx-muted px-4 py-4 text-[14px]">Сообщений нет</p>}
                {read.messages.map((m) => {
                  const hl = read.highlightAt !== null && m.createdAt === read.highlightAt;
                  return (
                    <div key={m.id} className="px-4 py-2" style={{ background: hl ? "color-mix(in srgb, var(--mx-danger) 14%, transparent)" : undefined }}>
                      <p className="text-[12.5px] mx-muted">{read.accounts[m.from]?.displayName ?? "Пользователь"} (@{read.accounts[m.from]?.handle ?? "?"}) · {new Date(m.createdAt).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" })}{hl ? " · ← из жалобы" : ""}</p>
                      <p className="text-[14.5px] whitespace-pre-wrap break-words">{m.deleted ? <em className="mx-muted">сообщение удалено</em> : m.text || (m.mediaUrl ? <a href={m.mediaUrl} target="_blank" rel="noreferrer" style={{ color: "var(--mx-accent)" }}>[{m.kind}] открыть файл</a> : `[${m.kind}]`)}</p>
                    </div>
                  );
                })}
              </div>
            )}
            {audit.length > 0 && (
              <div className="mx-card">
                <p className="px-4 pt-3 pb-1 text-[13px] uppercase tracking-wide mx-muted">Журнал чтений</p>
                {audit.map((a, i) => <p key={i} className="px-4 py-1.5 text-[12.5px] mx-muted truncate">{new Date(a.at).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" })} · {a.adminUid.slice(0, 6)}… · {a.reason ?? ""}</p>)}
              </div>
            )}
          </>
        )}

        {tab === "stickers" && (
          <div className="mx-card p-4 space-y-2">
            <p className="font-semibold">Стикерпаки</p>
            <p className="mx-muted text-[14px]">Всего наборов: {stats?.stickerPacks ?? "…"}. Пользователи сами привозят наборы из Telegram по ссылке (Настройки → Стикеры). Премиум-наборы с загрузкой своих картинок создаются на сайте.</p>
            <a href="/admin/messenger" className="mx-btn inline-block text-center w-full">Открыть управление наборами</a>
          </div>
        )}
      </div>
    </>
  );
}
