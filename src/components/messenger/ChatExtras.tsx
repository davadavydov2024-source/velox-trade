"use client";

import { useEffect, useState } from "react";
import { BadgeCheck, Copy, Crown, Lock, Shield, Trash2, UserPlus } from "lucide-react";
import { useToast } from "@/lib/toastContext";
import { mApi, MApiError } from "@/lib/messenger/client";
import { DEFAULT_PERMISSIONS, MessengerChat, MessengerStickerPack } from "@/lib/messenger/types";
import { Accs, Avatar, Sheet, Switch, chatMeta, cx, lastSeenText } from "./mui";

type Pack = MessengerStickerPack & { locked?: boolean };

function Sticker({ url, size }: { url: string; size: number }) {
  return url.endsWith(".webm")
    ? <video src={url} autoPlay loop muted playsInline style={{ width: size, height: size }} className="object-contain" />
    // eslint-disable-next-line @next/next/no-img-element
    : <img src={url} alt="" loading="lazy" style={{ width: size, height: size }} className="object-contain" />;
}

/** Панель стикеров над полем ввода: вкладки по наборам; премиум-наборы без Mili Premium закрыты замком. */
export function StickerPanel({ onPick }: { onPick: (slug: string, index: number) => void }) {
  const [packs, setPacks] = useState<Pack[] | null>(null);
  const [idx, setIdx] = useState(0);
  useEffect(() => { mApi<{ packs: Pack[] }>("stickers").then((d) => setPacks(d.packs)).catch(() => setPacks([])); }, []);
  const pack = packs?.[idx];
  return (
    <div className="border-b border-border h-[260px] flex flex-col">
      <div className="flex-1 overflow-y-auto p-2">
        {packs === null ? <p className="text-center text-white/30 text-sm py-10">Загрузка…</p>
          : packs.length === 0 ? <p className="text-center text-white/40 text-sm py-10 px-6">Стикеров пока нет. Открой ссылку набора вида <b>/m?stickers=название</b>, нажми «Добавить» — и они появятся здесь.</p>
          : (
            <div className="grid grid-cols-4 gap-1">
              {pack?.stickers.map((s, i) => (
                <button key={i} onClick={() => (pack.locked ? alert("Эти стикеры доступны только с Mili Premium ⭐ (Настройки → Mili Premium)") : onPick(pack.slug, i))} className="relative aspect-square flex items-center justify-center rounded-xl hover:bg-white/5 active:scale-95 transition-transform">
                  <Sticker url={s.url} size={72} />
                  {pack.locked && <Lock size={14} className="absolute bottom-1 right-1 text-white/60" />}
                </button>
              ))}
            </div>
          )}
      </div>
      {packs && packs.length > 0 && (
        <div className="flex gap-1 overflow-x-auto scrollbar-none p-1.5 border-t border-border">
          {packs.map((p, i) => (
            <button key={p.slug} onClick={() => setIdx(i)} className={cx("shrink-0 w-11 h-11 rounded-lg flex items-center justify-center", i === idx ? "bg-white/15" : "opacity-70")}>
              {p.stickers[0] ? <Sticker url={p.stickers[0].url} size={32} /> : "🙂"}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Карточка набора по ссылке /m?stickers=<slug> с кнопкой «Добавить». */
export function StickerPackSheet({ slug, onClose }: { slug: string; onClose: () => void }) {
  const { toast } = useToast();
  const [data, setData] = useState<{ pack: Pack; added: boolean; locked: boolean } | null | undefined>(undefined);
  useEffect(() => { mApi(`stickers?slug=${encodeURIComponent(slug)}`).then(setData).catch(() => setData(null)); }, [slug]);
  async function add() {
    try { await mApi("stickers", { slug, action: data?.added ? "remove" : "add" }); toast("success", data?.added ? "Набор удалён" : "Набор добавлен"); onClose(); }
    catch (e: any) { toast("error", e?.data?.needPremium ? "Этот набор доступен только с Mili Premium ⭐ (Настройки → Mili Premium)" : e?.message || "Не получилось"); }
  }
  return (
    <Sheet onClose={onClose} title={data?.pack.title ?? "Набор стикеров"}>
      <div className="px-5 pb-5 space-y-3">
        {data === undefined ? <p className="text-white/40 text-sm py-6 text-center">Загрузка…</p> : data === null ? <p className="text-white/50 text-sm py-6 text-center">Набор не найден.</p> : (
          <>
            {data.pack.premium && <p className="text-xs text-yellow-300">⭐ Премиум-набор{data.locked ? " — нужен Mili Premium" : ""}</p>}
            <div className="grid grid-cols-4 gap-1 max-h-64 overflow-y-auto">{data.pack.stickers.map((s, i) => <div key={i} className="aspect-square flex items-center justify-center"><Sticker url={s.url} size={64} /></div>)}</div>
            <button onClick={add} className={cx("w-full py-3 rounded-btn font-semibold", data.added ? "bg-white/10 text-red-300" : "btn-primary")}>{data.added ? "Удалить набор" : `Добавить ${data.pack.stickers.length} стикеров`}</button>
          </>
        )}
      </div>
    </Sheet>
  );
}

/** Конструктор опроса / викторины. */
export function PollCreator({ onClose, onSend }: { onClose: () => void; onSend: (poll: Record<string, unknown>) => Promise<void> }) {
  const { toast } = useToast();
  const [q, setQ] = useState("");
  const [opts, setOpts] = useState(["", ""]);
  const [anon, setAnon] = useState(true);
  const [multi, setMulti] = useState(false);
  const [quiz, setQuiz] = useState(false);
  const [correct, setCorrect] = useState(0);
  const [busy, setBusy] = useState(false);
  const filled = opts.map((o) => o.trim());
  async function submit() {
    if (q.trim().length < 1 || filled.filter(Boolean).length < 2) return toast("warning", "Нужен вопрос и минимум два варианта");
    const clean = filled.filter(Boolean);
    setBusy(true);
    try { await onSend({ question: q.trim(), options: clean, anonymous: anon, multiple: multi && !quiz, ...(quiz ? { quiz: { correct: Math.min(correct, clean.length - 1) } } : {}) }); onClose(); }
    catch (e: any) { toast("error", e?.message || "Не получилось"); setBusy(false); }
  }
  return (
    <Sheet onClose={onClose} title="Новый опрос">
      <div className="px-5 pb-5 space-y-2.5">
        <input autoComplete="off" value={q} onChange={(e) => setQ(e.target.value)} maxLength={255} placeholder="Вопрос" className="input-field" />
        {opts.map((o, i) => (
          <div key={i} className="flex items-center gap-2">
            {quiz && <input autoComplete="off" type="radio" checked={correct === i} onChange={() => setCorrect(i)} title="Правильный ответ" />}
            <input autoComplete="off" value={o} onChange={(e) => setOpts((l) => l.map((x, j) => (j === i ? e.target.value : x)))} maxLength={100} placeholder={`Вариант ${i + 1}`} className="input-field py-2.5 text-sm" />
            {opts.length > 2 && <button onClick={() => setOpts((l) => l.filter((_, j) => j !== i))} className="text-white/40"><Trash2 size={16} /></button>}
          </div>
        ))}
        {opts.length < 10 && <button onClick={() => setOpts((l) => [...l, ""])} className="text-sm text-accent">+ Добавить вариант</button>}
        {([["Анонимное голосование", anon, setAnon, false], ["Несколько ответов", multi, setMulti, quiz], ["Режим викторины (один верный ответ)", quiz, setQuiz, false]] as const).map(([label, val, set, off]) => (
          <div key={label} className={cx("flex items-center justify-between text-sm", off && "opacity-40")}>{label}<Switch checked={val} disabled={off} onChange={(v: boolean) => set(v)} /></div>
        ))}
        <button disabled={busy} onClick={submit} className="btn-primary w-full py-3 disabled:opacity-50">Отправить опрос</button>
      </div>
    </Sheet>
  );
}

/** Информация о чате: профиль человека, либо группа/канал — участники, роли, права, ссылка-приглашение, заявки. */
export function ChatInfo({ uid, chat, accs, onClose, onLeft }: { uid: string; chat: MessengerChat; accs: Accs; onClose: () => void; onLeft: () => void }) {
  const { toast } = useToast();
  const meta = chatMeta(chat, uid, accs);
  const isCreator = chat.createdBy === uid;
  const isAdmin = isCreator || chat.admins.includes(uid);
  const perms = { ...DEFAULT_PERMISSIONS, ...(chat.permissions ?? {}) };
  const [expanded, setExpanded] = useState<string | null>(null);
  const [addText, setAddText] = useState("");
  const [requests, setRequests] = useState<{ uid: string; handle: string; displayName: string; photoURL: string | null }[]>([]);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const link = chat.inviteCode ? `${origin}/m?join=${chat.inviteCode}` : null;

  useEffect(() => {
    if (chat.type !== "dm" && isAdmin && chat.joinByRequest) mApi<{ requests: typeof requests }>(`join-requests?chatId=${chat.id}`).then((d) => setRequests(d.requests)).catch(() => {});
  }, [chat.id, chat.type, chat.joinByRequest, isAdmin]);

  const run = async (fn: () => Promise<unknown>, ok?: string) => { try { await fn(); if (ok) toast("success", ok); } catch (e) { toast("error", (e as MApiError)?.message || "Не получилось"); } };
  const setPerm = (patch: Record<string, unknown>) => run(() => mApi("chat-permissions", { chatId: chat.id, ...patch }));
  const rights = (target: string, action: string, extra: Record<string, unknown> = {}) => run(() => mApi("member-rights", { chatId: chat.id, uid: target, action, ...extra }));

  if (chat.type === "dm") {
    const a = meta.account;
    return (
      <Sheet onClose={onClose}>
        <div className="p-5 flex flex-col items-center text-center gap-1">
          <Avatar name={meta.title} src={meta.photoURL} size={96} />
          <p className="text-xl font-bold mt-2 flex items-center gap-1">{meta.title}{meta.verified && <BadgeCheck size={18} className="text-accent" />}</p>
          {a && <p className="text-sm text-white/40">@{a.handle} · {lastSeenText(a)}</p>}
          {a?.bio && <p className="text-sm text-white/70 mt-3">{a.bio}</p>}
        </div>
      </Sheet>
    );
  }

  const ordered = Array.from(new Set([chat.createdBy, ...chat.admins, ...chat.members])).filter((u) => chat.members.includes(u)).slice(0, 80);
  const roleOf = (u: string) => (u === chat.createdBy ? "Создатель" : chat.admins.includes(u) ? chat.adminTitles?.[u] || "Админ" : "");

  return (
    <Sheet onClose={onClose}>
      <div className="p-5 pb-8 space-y-5">
        <div className="flex flex-col items-center text-center gap-1">
          <Avatar name={meta.title} src={meta.photoURL} size={96} />
          <p className="text-xl font-bold mt-2">{meta.title}</p>
          <p className="text-sm text-white/40">{chat.type === "channel" ? `${chat.members.length} подписчиков` : `${chat.members.length} участников`}{chat.handle ? ` · @${chat.handle}` : ""}</p>
          {chat.description && <p className="text-sm text-white/70 mt-2">{chat.description}</p>}
        </div>

        {isAdmin && (
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wide text-white/40">Ссылка-приглашение</p>
            {chat.handle && <p className="text-sm break-all text-accent">{origin}/m?join=@{chat.handle}</p>}
            {link ? (
              <div className="flex items-center gap-2">
                <p className="text-sm break-all flex-1 text-accent">{link}</p>
                <button onClick={() => { navigator.clipboard?.writeText(link); toast("success", "Скопировано"); }} className="text-white/60"><Copy size={18} /></button>
                <button onClick={() => run(() => mApi("invite", { chatId: chat.id, action: "revoke" }), "Ссылка отозвана")} className="text-red-300"><Trash2 size={18} /></button>
              </div>
            ) : <button onClick={() => run(() => mApi("invite", { chatId: chat.id, action: "create" }))} className="btn-secondary px-4 py-2 text-sm">Создать ссылку</button>}
          </div>
        )}

        {isAdmin && chat.type === "group" && (
          <div className="space-y-2.5">
            <p className="text-xs uppercase tracking-wide text-white/40">Что разрешено участникам</p>
            {([["sendMessages", "Писать сообщения"], ["sendMedia", "Отправлять медиа"], ["sendStickers", "Отправлять стикеры"], ["sendPolls", "Создавать опросы"], ["addMembers", "Добавлять участников"], ["pinMessages", "Закреплять сообщения"], ["changeInfo", "Менять информацию"]] as const).map(([k, label]) => (
              <div key={k} className="flex items-center justify-between text-sm">{label}<Switch checked={perms[k]} onChange={(v: boolean) => setPerm({ permissions: { [k]: v } })} /></div>
            ))}
            <label className="flex items-center justify-between text-sm">Медленный режим
              <select value={chat.slowModeSec ?? 0} onChange={(e) => setPerm({ slowModeSec: Number(e.target.value) })} className="input-field py-1.5 text-sm w-auto">
                {[[0, "Выкл"], [10, "10 с"], [30, "30 с"], [60, "1 мин"], [300, "5 мин"], [900, "15 мин"], [3600, "1 час"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
          </div>
        )}

        {isAdmin && (
          <div className="space-y-2.5">
            <p className="text-xs uppercase tracking-wide text-white/40">Настройки чата</p>
            <div className="flex items-center justify-between text-sm">Запретить пересылку и копирование<Switch checked={!!chat.noForwards} onChange={(v: boolean) => setPerm({ noForwards: v })} /></div>
            <div className="flex items-center justify-between text-sm">Вступление по заявке<Switch checked={!!chat.joinByRequest} onChange={(v: boolean) => setPerm({ joinByRequest: v })} /></div>
            <label className="flex items-center justify-between text-sm">Автоудаление сообщений
              <select value={chat.autoDeleteSec ?? 0} onChange={(e) => setPerm({ autoDeleteSec: Number(e.target.value) })} className="input-field py-1.5 text-sm w-auto">
                {[[0, "Выкл"], [86400, "1 день"], [604800, "1 неделя"], [2678400, "1 месяц"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
          </div>
        )}

        {requests.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wide text-white/40">Заявки на вступление</p>
            {requests.map((r) => (
              <div key={r.uid} className="flex items-center gap-3"><Avatar name={r.displayName} src={r.photoURL} size={36} /><span className="flex-1 truncate text-sm">{r.displayName} <span className="text-white/40">@{r.handle}</span></span>
                <button onClick={() => run(async () => { await mApi("join-requests", { chatId: chat.id, uid: r.uid, approve: true }); setRequests((l) => l.filter((x) => x.uid !== r.uid)); })} className="text-xs text-accent">Принять</button>
                <button onClick={() => run(async () => { await mApi("join-requests", { chatId: chat.id, uid: r.uid, approve: false }); setRequests((l) => l.filter((x) => x.uid !== r.uid)); })} className="text-xs text-red-300">Отклонить</button></div>
            ))}
          </div>
        )}

        {(isAdmin || (chat.type === "group" && perms.addMembers)) && (
          <div className="flex gap-2">
            <input autoComplete="off" value={addText} onChange={(e) => setAddText(e.target.value)} placeholder="@username через запятую" className="input-field py-2.5 text-sm" />
            <button onClick={() => run(async () => { const handles = addText.split(/[\s,]+/).filter(Boolean); const r = await mApi<{ added: number; skipped: string[] }>("members", { chatId: chat.id, action: "add", handles }); setAddText(""); toast(r.added ? "success" : "warning", r.added ? `Добавлено: ${r.added}${r.skipped?.length ? `, пропущено: ${r.skipped.length} (приватность)` : ""}` : "Никого не добавили (закрытая приватность или бан)"); })} className="btn-secondary px-3.5 shrink-0"><UserPlus size={18} /></button>
          </div>
        )}

        <div className="space-y-1">
          <p className="text-xs uppercase tracking-wide text-white/40 pb-1">{chat.type === "channel" ? "Подписчики" : "Участники"}</p>
          {ordered.map((u) => {
            const a = accs[u];
            const role = roleOf(u);
            const canManage = isAdmin && u !== uid && u !== chat.createdBy && (isCreator || !chat.admins.includes(u));
            const restricted = !!chat.restricted?.[u] && chat.restricted[u].until > Date.now();
            return (
              <div key={u}>
                <button onClick={() => canManage && setExpanded(expanded === u ? null : u)} className="w-full flex items-center gap-3 py-1.5 text-left">
                  <Avatar name={a?.displayName ?? "…"} src={a?.photoURL} size={40} />
                  <span className="flex-1 min-w-0"><span className="block truncate text-sm font-medium">{a?.displayName ?? "…"}{u === uid ? " (ты)" : ""}</span><span className="block text-xs text-white/40">{a ? `@${a.handle}` : ""}{restricted ? " · ограничен" : ""}</span></span>
                  {role && <span className="text-[11px] text-accent flex items-center gap-1">{u === chat.createdBy ? <Crown size={12} /> : <Shield size={12} />}{role}</span>}
                </button>
                {expanded === u && (
                  <div className="flex flex-wrap gap-1.5 pb-2 pl-[52px]">
                    {!chat.admins.includes(u) && isAdmin && chat.type === "group" && <button onClick={() => rights(u, "setAdmin", { rights: {} })} className="px-2.5 py-1 rounded-full bg-white/10 text-xs">Сделать админом</button>}
                    {chat.admins.includes(u) && isCreator && <button onClick={() => rights(u, "removeAdmin")} className="px-2.5 py-1 rounded-full bg-white/10 text-xs">Снять админа</button>}
                    {chat.admins.includes(u) && isCreator && <button onClick={() => { const t = prompt("Подпись админа (до 16 символов)"); if (t !== null) rights(u, "setTitle", { title: t }); }} className="px-2.5 py-1 rounded-full bg-white/10 text-xs">Подпись</button>}
                    {!chat.admins.includes(u) && chat.type === "group" && (restricted
                      ? <button onClick={() => rights(u, "unrestrict")} className="px-2.5 py-1 rounded-full bg-white/10 text-xs">Снять ограничение</button>
                      : <button onClick={() => rights(u, "restrict", { until: Date.now() + 86400_000, sendMessages: false })} className="px-2.5 py-1 rounded-full bg-white/10 text-xs">Заглушить на сутки</button>)}
                    <button onClick={() => confirm("Исключить участника?") && run(() => mApi("members", { chatId: chat.id, action: "remove", uid: u }))} className="px-2.5 py-1 rounded-full bg-red-500/20 text-red-300 text-xs">Исключить</button>
                    <button onClick={() => confirm("Забанить участника?") && rights(u, "ban")} className="px-2.5 py-1 rounded-full bg-red-500/20 text-red-300 text-xs">Забанить</button>
                  </div>
                )}
              </div>
            );
          })}
          {chat.members.length > 80 && <p className="text-xs text-white/30 pt-1">Показаны первые 80.</p>}
        </div>

        {!isCreator ? (
          <button onClick={() => confirm("Покинуть чат?") && run(async () => { await mApi("members", { chatId: chat.id, action: "leave" }); onLeft(); })} className="w-full py-3 rounded-btn bg-white/10 text-red-300">Покинуть чат</button>
        ) : (
          <button onClick={() => confirm("Удалить чат для всех?") && run(async () => { await mApi("members", { chatId: chat.id, action: "deleteChat" }); onLeft(); })} className="w-full py-3 rounded-btn bg-white/10 text-red-300">Удалить чат</button>
        )}
      </div>
    </Sheet>
  );
}
