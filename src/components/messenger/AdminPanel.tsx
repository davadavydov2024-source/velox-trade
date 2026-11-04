"use client";

import { useCallback, useEffect, useState } from "react";
import { BadgeCheck, Ban, Contact, Gift, Megaphone, ShieldAlert, Sparkles, Star, Trash2 } from "lucide-react";
import { authedFetch } from "@/lib/authedFetch";
import { useToast } from "@/lib/toastContext";
import { Avatar, PageHeader, Spinner } from "./ui";
import type { MAccount } from "./mtypes";
import { GIFTS, giftById } from "@/lib/messenger/gifts";
import { StickerPacksAdmin } from "./StickerPacksAdmin";
import { AdminNft } from "./AdminNft";
import { AdminMusic } from "./AdminMusic";
import { AdminUsernames } from "./AdminUsernames";
import { AdminNumbers } from "./AdminNumbers";
import { AdminAppIcon } from "./AdminAppIcon";
import { NFT_BACKDROPS, NFT_MODELS, NFT_SYMBOLS, type NftTrait } from "@/lib/messenger/nft";

type Stats = { accounts: number; chats: number; openReports: number; premium: number; gifts: number; stickerPacks: number; newToday: number; nft: number; stories: number };
type AuditItem = { id: string; at: number; action: string; adminName: string; targetName: string; info: Record<string, any> };

function auditLabel(a: AuditItem): string {
  const i = a.info;
  switch (a.action) {
    case "messenger_grant_premium": return `Выдан Premium на ${i.days} дн.`;
    case "messenger_revoke_premium": return "Снят Premium";
    case "messenger_grant_stars": return `Начислено ${i.amount} ⭐`;
    case "messenger_grant_gift": return `Подарок «${giftById(String(i.giftId))?.title ?? i.giftId}» × ${i.count ?? 1}`;
    case "messenger_revoke_gift": return "Подарок отобран";
    case "messenger_sticker_pack_save": return `Набор стикеров сохранён: ${i.slug} (${i.count} шт)`;
    case "messenger_sticker_pack_delete": return `Набор стикеров удалён: ${i.slug}`;
    case "read_chat": return "Открыта переписка (по жалобе)";
    case "messenger_contacts": return `Просмотрены контакты (${i.count ?? 0}): ${i.reason ?? ""}`;
    default: return a.action;
  }
}
type Report = { id: string; reporterUid: string; chatId: string; msgId: string; from: string; kind: string; textSnapshot?: string; reason: string; createdAt: number };
type ReadMsg = { id: string; from: string; kind: string; text: string; mediaUrl: string | null; createdAt: number; deleted: boolean };
type ReadResult = { chat: { id: string; type: string; title: string | null }; messages: ReadMsg[]; accounts: Record<string, { displayName: string; handle: string }>; highlightAt: number | null };
type GrantInfo = { account: { uid: string; handle: string; displayName: string; premiumUntil: number; verified: boolean; banned: boolean }; wallet: number; gifts: { id: string; giftId: string; at: number; nft: { number: number; supply: number; model: string; backdrop: string; symbol: string } | null; byAdmin: boolean }[] };
type Past = { id: string; text: string; target: string; sent: number; createdAt: number; done: boolean };
const TARGETS: [string, string][] = [["all", "Всем"], ["premium", "Только Mili Premium"], ["verified", "Только с галочкой"]];
const TABS = [["stats", "Обзор"], ["broadcast", "Рассылка"], ["users", "Люди"], ["give", "Выдать"], ["reports", "Жалобы"], ["chats", "Чаты"], ["nft", "NFT"], ["stickers", "Стикеры"], ["music", "Музыка"], ["usernames", "Юзернеймы"], ["numbers", "Номера"], ["appicon", "Иконка"], ["audit", "Журнал"]] as const;
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
  const [audit, setAudit] = useState<AuditItem[] | null>(null);
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

  // «Выдать»: премиум, ⭐, подарки и NFT
  const [giveTo, setGiveTo] = useState<MAccount | null>(null);
  const [info, setInfo] = useState<GrantInfo | null>(null);
  const [busyKey, setBusyKey] = useState("");
  const [giftId, setGiftId] = useState("rocket");
  const [giftMsg, setGiftMsg] = useState("");
  const [giftCount, setGiftCount] = useState(1);
  const [giftFrom, setGiftFrom] = useState<"service" | "me">("service");
  const [traits, setTraits] = useState({ model: "", backdrop: "", symbol: "" });
  const [starsAmount, setStarsAmount] = useState("");

  // чтение переписки (только по жалобе или с указанием причины; всё пишется в журнал)
  const [ra, setRa] = useState("");
  const [rb, setRb] = useState("");
  const [rChat, setRChat] = useState("");
  const [reason, setReason] = useState("");
  const [reading, setReading] = useState(false);
  const [read, setRead] = useState<ReadResult | null>(null);
  const [readLog, setReadLog] = useState<{ adminUid: string; chatId?: string; reason?: string; at: number }[]>([]);
  const openChat = async (qs: string) => {
    setReading(true);
    try { setRead(await call<ReadResult>(`/api/admin/messenger/chats?${qs}`)); setTab("chats"); call<{ audit: any[] }>("/api/admin/messenger/chats?audit=1").then((d) => setReadLog(d.audit)).catch(() => {}); } catch (e: any) { toast("error", e.message); } finally { setReading(false); }
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

  const loadInfo = useCallback(async (uid: string) => {
    try { setInfo(await call<GrantInfo>(`/api/admin/messenger/grant?uid=${encodeURIComponent(uid)}`)); } catch (e: any) { toast("error", e.message); }
  }, [toast]);
  const [contacts, setContacts] = useState<{ uid: string; displayName: string; handle: string; lastAt: number }[] | null>(null);
  const loadContacts = async (uid: string) => {
    const reason = window.prompt("Причина просмотра контактов (не короче 10 символов). Просмотр записывается в журнал.");
    if (!reason) return;
    try { setContacts((await call<{ contacts: { uid: string; displayName: string; handle: string; lastAt: number }[] }>(`/api/admin/messenger/contacts?uid=${encodeURIComponent(uid)}&reason=${encodeURIComponent(reason)}`)).contacts); } catch (e: any) { toast("error", e.message); }
  };
  const pickTarget = (a: MAccount) => { setGiveTo(a); setInfo(null); setContacts(null); loadInfo(a.uid); };
  const grant = async (key: string, body: Record<string, unknown>, ok: string) => {
    if (!giveTo) return;
    setBusyKey(key);
    try {
      await call("/api/admin/messenger/grant", { uid: giveTo.uid, ...body });
      toast("success", ok);
      await loadInfo(giveTo.uid);
    } catch (e: any) { toast("error", e.message); } finally { setBusyKey(""); }
  };
  useEffect(() => {
    if (tab !== "audit") return;
    setAudit(null);
    call<{ items: AuditItem[] }>("/api/admin/messenger/audit").then((d) => setAudit(d.items)).catch((e: any) => { toast("error", e.message); setAudit([]); });
  }, [tab, toast]);
  const selGift = giftById(giftId);

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
            {stat("новых за 24 часа", stats?.newToday)}{stat("NFT выдано", stats?.nft)}
            {stat("активных историй", stats?.stories)}
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

        {tab === "give" && (
          <>
            <input className="mx-input w-full" placeholder="Найти человека по @username (от 2 символов)" value={q} onChange={(e) => { setQ(e.target.value); if (e.target.value.trim().length >= 2 || !e.target.value.trim()) load(e.target.value); }} autoCapitalize="none" />
            {!giveTo && loading && <div className="flex justify-center"><Spinner /></div>}
            {!giveTo && (
              <div className="mx-card">
                {people.map((a) => (
                  <button key={a.uid} onClick={() => pickTarget(a)} className="w-full text-left px-4 py-3 flex items-center gap-3">
                    <Avatar src={a.photoURL} name={a.displayName} seed={a.uid} size={40} />
                    <div className="min-w-0 flex-1"><p className="truncate font-semibold">{a.displayName}</p><p className="mx-muted text-[12.5px]">@{a.handle}</p></div>
                    <span className="mx-muted text-[13px]">Выбрать</span>
                  </button>
                ))}
                {!loading && people.length === 0 && <p className="mx-muted px-4 py-4 text-[14px]">Никого не найдено</p>}
              </div>
            )}

            {giveTo && (
              <>
                <div className="mx-card px-4 py-3 flex items-center gap-3">
                  <Avatar src={giveTo.photoURL} name={giveTo.displayName} seed={giveTo.uid} size={46} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{giveTo.displayName}</p>
                    <p className="mx-muted text-[12.5px]">@{giveTo.handle}</p>
                    <p className="text-[12.5px] mt-0.5" style={{ color: "var(--mx-accent)" }}>
                      {info ? `${info.wallet} ⭐ · ${info.account.premiumUntil > Date.now() ? `Premium до ${new Date(info.account.premiumUntil).toLocaleDateString("ru-RU")}` : "без Premium"}` : "Загружаю…"}
                    </p>
                  </div>
                  <button className="mx-chip" onClick={() => { setGiveTo(null); setInfo(null); }}>Другой</button>
                </div>

                <div className="mx-card p-4 space-y-3">
                  <p className="font-semibold flex items-center gap-2"><Star size={16} style={{ color: "var(--mx-accent)" }} /> Mili Premium</p>
                  <div className="flex gap-1.5 flex-wrap">
                    {[7, 30, 90, 365].map((d) => (
                      <button key={d} className="mx-chip" disabled={!!busyKey} onClick={() => grant(`p${d}`, { action: "premium", days: d }, `Premium +${d} дн.`)}>{busyKey === `p${d}` ? "…" : `+${d} дн.`}</button>
                    ))}
                    <button className="mx-chip" disabled={!!busyKey} onClick={() => confirm("Снять Premium?") && grant("pr", { action: "premiumRevoke" }, "Premium снят")}>Снять</button>
                  </div>
                </div>

                <div className="mx-card p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold">⭐ Пополнить кошелёк MiliGram</p>
                    <span className="text-[13px] mx-muted">сейчас: <b style={{ color: "var(--mx-text)" }}>{info ? info.wallet : "…"} ⭐</b></span>
                  </div>
                  <div className="flex gap-1.5 flex-wrap">
                    {[10, 50, 100, 250, 500, 1000, 5000].map((n) => (
                      <button key={n} className="mx-chip" style={Number(starsAmount) === n ? { background: "var(--mx-accent)", color: "#fff" } : undefined} onClick={() => setStarsAmount(String(n))}>{n}</button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 rounded-2xl px-3" style={{ background: "var(--mx-surface)" }}>
                    <span className="text-[18px]">⭐</span>
                    <input className="flex-1 bg-transparent outline-none py-3 text-[18px] font-semibold tabular-nums" type="text" inputMode="numeric" placeholder="Сумма" value={starsAmount}
                      onChange={(e) => setStarsAmount(e.target.value.replace(/\D/g, "").slice(0, 7))}
                      onKeyDown={(e) => { if (e.key === "Enter" && starsAmount && !busyKey) document.getElementById("mx-stars-go")?.click(); }} />
                    {starsAmount && <button className="mx-muted text-[13px]" onClick={() => setStarsAmount("")} aria-label="Очистить">✕</button>}
                  </div>
                  {starsAmount && info && <p className="mx-muted text-[13px]">После пополнения будет: <b style={{ color: "var(--mx-text)" }}>{info.wallet + Number(starsAmount)} ⭐</b></p>}
                  <button id="mx-stars-go" className="mx-btn w-full" disabled={!!busyKey || !starsAmount || Number(starsAmount) < 1 || Number(starsAmount) > 1_000_000}
                    onClick={() => { const n = Number(starsAmount); if (n >= 5000 && !window.confirm(`Начислить ${n} ⭐ пользователю @${giveTo.handle}?`)) return; grant("st", { action: "stars", amount: n }, `Начислено ${n} ⭐`).then(() => setStarsAmount("")); }}>
                    {busyKey === "st" ? "Начисляю…" : starsAmount ? `Начислить ${starsAmount} ⭐` : "Начислить"}
                  </button>
                  <p className="mx-muted text-[12px]">Звёзды попадают в кошелёк MiliGram (подарки, Premium, юзернеймы), не в баланс магазина Velox Trade. Начисление записывается в журнал, человеку приходит уведомление.</p>
                </div>

                <div className="mx-card p-4 space-y-3">
                  <p className="font-semibold flex items-center gap-2"><Gift size={16} style={{ color: "var(--mx-accent)" }} /> Подарок или NFT</p>
                  <select className="mx-input w-full" value={giftId} onChange={(e) => setGiftId(e.target.value)}>
                    <optgroup label="✨ NFT (уникальные)">
                      {GIFTS.filter((g) => g.nft).map((g) => <option key={g.id} value={g.id}>{g.emoji} {g.title} · тираж {g.limited}</option>)}
                    </optgroup>
                    <optgroup label="Обычные подарки">
                      {GIFTS.filter((g) => !g.nft).map((g) => <option key={g.id} value={g.id}>{g.emoji} {g.title} · {g.price} ⭐</option>)}
                    </optgroup>
                  </select>
                  {selGift?.nft && (
                    <div className="space-y-2">
                      <p className="mx-muted text-[12.5px] flex items-center gap-1"><Sparkles size={13} /> Признаки NFT — по умолчанию выпадают случайно, можно выбрать свои</p>
                      {([["model", "Модель", NFT_MODELS], ["backdrop", "Фон", NFT_BACKDROPS], ["symbol", "Узор", NFT_SYMBOLS]] as const).map(([key, label, list]) => (
                        <select key={key} className="mx-input w-full" value={traits[key]} onChange={(e) => setTraits((t) => ({ ...t, [key]: e.target.value }))}>
                          <option value="">{label}: случайно</option>
                          {(list as readonly NftTrait[]).map((t) => <option key={t.name} value={t.name}>{label}: {t.name}</option>)}
                        </select>
                      ))}
                    </div>
                  )}
                  <input className="mx-input w-full" maxLength={120} placeholder="Подпись к подарку (необязательно)" value={giftMsg} onChange={(e) => setGiftMsg(e.target.value)} />
                  <div className="flex gap-2">
                    <select className="mx-input flex-1" value={giftFrom} onChange={(e) => setGiftFrom(e.target.value as "service" | "me")}>
                      <option value="service">От «MiliGram»</option>
                      <option value="me">От меня</option>
                    </select>
                    <select className="mx-input w-24" value={giftCount} onChange={(e) => setGiftCount(Number(e.target.value))}>
                      {[1, 2, 3, 5, 10].map((n) => <option key={n} value={n}>× {n}</option>)}
                    </select>
                  </div>
                  <button
                    className="mx-btn w-full"
                    disabled={!!busyKey}
                    onClick={() => grant("g", { action: "gift", giftId, count: giftCount, message: giftMsg, from: giftFrom, ...(selGift?.nft ? { nft: traits } : {}) }, "Подарок выдан").then(() => setGiftMsg(""))}
                  >
                    {busyKey === "g" ? "Дарю…" : `Подарить${giftCount > 1 ? ` × ${giftCount}` : ""}`}
                  </button>
                  <p className="mx-muted text-[12px]">Бесплатно для тебя. Подарки от администрации нельзя обменять на ⭐. NFT занимает номер в тираже.</p>
                </div>

                <div className="mx-card">
                  <p className="px-4 pt-3 pb-1 text-[13px] uppercase tracking-wide mx-muted">Подарки у человека{info ? ` · ${info.gifts.length}` : ""}</p>
                  {info && info.gifts.length === 0 && <p className="mx-muted px-4 py-3 text-[14px]">Пока нет</p>}
                  {info?.gifts.map((g) => {
                    const def = giftById(g.giftId);
                    return (
                      <div key={g.id} className="px-4 py-2 flex items-center gap-3">
                        <span className="text-[22px]">{def?.emoji ?? "🎁"}</span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[14.5px]">{def?.title ?? g.giftId}{g.nft ? ` · №${g.nft.number}/${g.nft.supply}` : ""}{g.byAdmin ? " · от админа" : ""}</p>
                          {g.nft && <p className="mx-muted text-[12px] truncate">{g.nft.model} · {g.nft.backdrop} · {g.nft.symbol}</p>}
                        </div>
                        <button className="p-2" aria-label="Забрать подарок" disabled={!!busyKey} onClick={() => confirm("Забрать этот подарок у человека?") && grant(`r${g.id}`, { action: "revokeGift", giftDocId: g.id }, "Подарок забран")}><Trash2 size={16} /></button>
                      </div>
                    );
                  })}
                </div>

                <div className="mx-card p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold">Контакты</p>
                    <button className="mx-chip" onClick={() => loadContacts(giveTo.uid)}><Contact size={14} /> {contacts ? "Обновить" : "Показать"}</button>
                  </div>
                  <p className="mx-muted text-[12px]">Только имена и @username собеседников (без текста переписок). Нужна причина, просмотр пишется в журнал.</p>
                  {contacts && contacts.length === 0 && <p className="mx-muted text-[14px]">Личных чатов нет</p>}
                  {contacts?.map((c) => (
                    <div key={c.uid} className="flex items-center justify-between text-[14.5px] py-0.5">
                      <span className="truncate">{c.displayName || "—"}</span>
                      <span className="mx-muted shrink-0 ml-2">@{c.handle}</span>
                    </div>
                  ))}
                </div>

                <div className="mx-card p-4 space-y-2">
                  <p className="font-semibold">Остальное</p>
                  <div className="flex gap-1.5 flex-wrap">
                    <button className="mx-chip" onClick={() => act({ action: info?.account.verified ? "unverify" : "verify", uid: giveTo.uid }, "Готово").then(() => loadInfo(giveTo.uid))}><BadgeCheck size={14} /> {info?.account.verified ? "Снять галочку" : "Выдать галочку"}</button>
                    <button className="mx-chip" onClick={() => act({ action: info?.account.banned ? "unban" : "ban", uid: giveTo.uid }, info?.account.banned ? "Разбанен" : "Забанен").then(() => loadInfo(giveTo.uid))}><Ban size={14} /> {info?.account.banned ? "Разбан" : "Бан"}</button>
                  </div>
                </div>
              </>
            )}
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
            {readLog.length > 0 && (
              <div className="mx-card">
                <p className="px-4 pt-3 pb-1 text-[13px] uppercase tracking-wide mx-muted">Журнал чтений</p>
                {readLog.map((a, i) => <p key={i} className="px-4 py-1.5 text-[12.5px] mx-muted truncate">{new Date(a.at).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" })} · {a.adminUid.slice(0, 6)}… · {a.reason ?? ""}</p>)}
              </div>
            )}
          </>
        )}

        {tab === "nft" && <AdminNft />}
        {tab === "stickers" && <StickerPacksAdmin />}
        {tab === "music" && <AdminMusic />}
        {tab === "usernames" && <AdminUsernames />}
        {tab === "numbers" && <AdminNumbers />}
        {tab === "appicon" && <AdminAppIcon />}

        {tab === "audit" && (
          <div className="mx-card">
            <p className="px-4 pt-3 pb-1 text-[13px] uppercase tracking-wide mx-muted">Последние действия администраторов</p>
            {audit === null ? <div className="flex justify-center py-6"><Spinner /></div> : audit.length === 0 ? <p className="mx-muted px-4 py-4 text-[14px]">Записей пока нет</p> : audit.map((a) => (
              <div key={a.id} className="px-4 py-2.5">
                <p className="text-[14.5px]">{auditLabel(a)}</p>
                <p className="mx-muted text-[12.5px]">{a.adminName}{a.targetName ? ` → ${a.targetName}` : ""} · {new Date(a.at).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
