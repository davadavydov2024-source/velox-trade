"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Crown, ShieldOff, UserMinus, UserPlus } from "lucide-react";
import { useToast } from "@/lib/toastContext";
import { mApi, mUpload, MApiError } from "./api";
import { useAccounts } from "./hooks";
import { Avatar, Section, Sheet, Switch } from "./ui";
import { PersonRow, usePeopleSearch } from "./NewChatSheet";
import { MAccount, MChat } from "./mtypes";

type Row = { uid: string; badge?: string };

/** Список людей канала/группы: администраторы, подписчики или чёрный список — с действиями для админов. */
export function PeopleListSheet({ open, onClose, chat, me, mode, canManage }: { open: boolean; onClose: () => void; chat: MChat; me: string; mode: "admins" | "members" | "banned"; canManage: boolean }) {
  const { toast } = useToast();
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState("");
  const { results } = usePeopleSearch(q, open && adding);
  const adminSet = Array.from(new Set([chat.createdBy, ...(chat.admins ?? [])]));
  const uids = mode === "admins" ? adminSet : mode === "banned" ? chat.banned ?? [] : chat.members;
  const accounts = useAccounts(open ? uids : []);
  const title = mode === "admins" ? "Администраторы" : mode === "banned" ? "Чёрный список" : chat.type === "channel" ? "Подписчики" : "Участники";

  useEffect(() => { if (!open) { setAdding(false); setQ(""); } }, [open]);

  const call = async (path: string, body: Record<string, unknown>, ok?: string) => {
    try { await mApi(path, { chatId: chat.id, ...body }); if (ok) toast("success", ok); setAdding(false); setQ(""); } catch (e) { toast("error", e instanceof MApiError ? e.message : "Не получилось"); }
  };

  const rows: Row[] = uids.map((uid) => ({ uid, badge: uid === chat.createdBy ? "владелец" : adminSet.includes(uid) ? chat.adminTitles?.[uid] || "админ" : undefined }));
  return (
    <Sheet open={open} onClose={onClose} title={title} full zIndex={60}>
      <div className="pb-8">
        {mode === "members" && canManage && (
          <Section footer={chat.type === "channel" ? "Этот список видят только администраторы канала." : undefined}>
            {!adding ? (
              <button onClick={() => setAdding(true)} className="w-full flex items-center gap-3 px-4 py-3 text-left" style={{ color: "var(--mx-accent)" }}><UserPlus size={22} /> Добавить подписчиков</button>
            ) : (
              <div className="p-3">
                <input className="mx-input" placeholder="Имя или @username" value={q} onChange={(e) => setQ(e.target.value)} autoFocus autoCapitalize="none" />
                {results.filter((r: MAccount) => !chat.members.includes(r.uid)).map((a: MAccount) => <PersonRow key={a.uid} acc={a} onPress={() => call("members", { action: "add", handles: [a.handle] })} />)}
              </div>
            )}
          </Section>
        )}
        <Section>
          {rows.length === 0 && <p className="mx-muted px-4 py-4 text-[14px]">{mode === "banned" ? "Чёрный список пуст" : "Пока никого"}</p>}
          {rows.map(({ uid, badge }) => {
            const a = accounts[uid];
            return (
              <div key={uid} className="flex items-center gap-3 px-4 py-2.5">
                <Avatar src={a?.photoURL} name={a?.displayName ?? "?"} seed={uid} size={44} />
                <div className="min-w-0 flex-1">
                  <p className="truncate">{a?.displayName ?? "Пользователь"}{uid === me ? " (вы)" : ""}</p>
                  <p className="text-[12.5px] mx-muted">{a ? `@${a.handle}` : ""}</p>
                </div>
                {badge && <span className="text-[12px] flex items-center gap-1" style={{ color: "var(--mx-accent)" }}><Crown size={13} /> {badge}</span>}
                {canManage && mode === "banned" && <button onClick={() => call("member-rights", { uid, action: "unban" }, "Разблокирован")} className="mx-btn-ghost text-[13px] px-2 py-1"><ShieldOff size={16} className="inline mr-1" />Вернуть</button>}
                {canManage && mode === "members" && uid !== me && !adminSet.includes(uid) && <button onClick={() => confirm("Исключить и заблокировать?") && call("members", { action: "remove", uid, ban: true })} className="p-1.5 mx-muted" aria-label="Исключить"><UserMinus size={19} /></button>}
                {canManage && mode === "admins" && chat.createdBy === me && uid !== me && uid !== chat.createdBy && <button onClick={() => confirm("Снять с админов?") && call("member-rights", { uid, action: "removeAdmin" })} className="mx-btn-ghost text-[13px] px-2 py-1">Снять</button>}
              </div>
            );
          })}
        </Section>
        {mode === "admins" && canManage && chat.createdBy === me && (
          <Section title="Назначить администратором" footer="Выбери из подписчиков — получит права публиковать, редактировать и удалять посты.">
            <div className="p-3">
              <input className="mx-input" placeholder="Имя или @username подписчика" value={q} onChange={(e) => { setQ(e.target.value); setAdding(true); }} autoCapitalize="none" />
              {adding && results.filter((r: MAccount) => chat.members.includes(r.uid) && !adminSet.includes(r.uid)).map((a: MAccount) => (
                <PersonRow key={a.uid} acc={a} onPress={() => call("member-rights", { uid: a.uid, action: "setAdmin", rights: { changeInfo: true, deleteMessages: true, postMessages: true, editMessages: true, pinMessages: true, inviteUsers: true } }, "Назначен администратором")} />
              ))}
            </div>
          </Section>
        )}
      </div>
    </Sheet>
  );
}

const AUTODELETE = [["Выкл.", 0], ["1 день", 86400], ["1 неделя", 604800], ["1 месяц", 2678400]] as const;

/** «Настройки канала» (как «Изм.» в Telegram): фото, название, описание, защита контента, заявки на вступление, автоудаление. */
export function ChannelSettingsSheet({ open, onClose, chat, me, onCounts }: { open: boolean; onClose: () => void; chat: MChat; me: string; onCounts: (k: "admins" | "members" | "banned") => void }) {
  const { toast } = useToast();
  const [title, setTitle] = useState(chat.title ?? "");
  const [desc, setDesc] = useState(chat.description ?? "");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const kind = chat.type === "channel" ? "канал" : "группу";

  useEffect(() => { if (open) { setTitle(chat.title ?? ""); setDesc(chat.description ?? ""); } }, [open, chat.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true);
    try { await fn(); if (ok) toast("success", ok); } catch (e) { toast("error", e instanceof MApiError ? e.message : "Не получилось"); } finally { setBusy(false); }
  };
  const perms = (patch: Record<string, unknown>) => run(() => mApi("chat-permissions", { chatId: chat.id, ...patch }));
  const pickPhoto = (f?: File) => f && run(async () => { const up = await mUpload(f, "avatar", { fileName: "chat.jpg" }); await mApi("chat-info", { chatId: chat.id, photoURL: up.url }); }, "Фото обновлено");

  const link = chat.handle ? `${typeof location !== "undefined" ? location.origin : ""}/m?join=@${chat.handle}` : chat.inviteCode ? `${typeof location !== "undefined" ? location.origin : ""}/m?join=${chat.inviteCode}` : "";
  return (
    <Sheet open={open} onClose={onClose} title="Настройки" full zIndex={60}>
      <div className="pb-10">
        <div className="flex flex-col items-center py-3">
          <button onClick={() => fileRef.current?.click()} className="relative" disabled={busy}>
            <Avatar src={chat.photoURL} name={chat.title ?? "?"} seed={chat.id} size={96} />
            <span className="absolute bottom-0 right-0 w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "var(--mx-accent)", color: "var(--mx-accent-text)", border: "3px solid var(--mx-surface)" }}><Camera size={15} /></span>
          </button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { pickPhoto(e.target.files?.[0]); e.target.value = ""; }} />
          <p className="mx-muted text-[13px] mt-2">Изменить фотографию</p>
        </div>
        <div className="px-4 space-y-3">
          <input className="mx-input" value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} placeholder="Название" />
          <textarea className="mx-input" rows={4} value={desc} maxLength={300} onChange={(e) => setDesc(e.target.value)} placeholder="Описание" />
          <button className="mx-btn w-full" disabled={busy || title.trim().length < 2} onClick={() => run(() => mApi("chat-info", { chatId: chat.id, title: title.trim(), description: desc }), "Сохранено")}>Сохранить</button>
        </div>

        <div className="h-5" />
        <Section title="Доступ" footer={link ? `Ссылка: ${link}` : undefined}>
          <div className="flex items-center justify-between px-4 py-3"><span>Тип</span><span className="mx-muted">{chat.handle ? "Публичный" : "Частный"}</span></div>
          <div className="flex items-center justify-between px-4 py-3"><span>Вступление по заявке</span><Switch on={!!chat.joinByRequest} onChange={(v) => perms({ joinByRequest: v })} disabled={busy} /></div>
          <div className="flex items-center justify-between px-4 py-3"><span>Защищённый контент</span><Switch on={!!chat.noForwards} onChange={(v) => perms({ noForwards: v })} disabled={busy} /></div>
        </Section>
        <Section title="Автоудаление сообщений">
          <div className="flex flex-wrap gap-2 p-3">
            {AUTODELETE.map(([label, sec]) => (
              <button key={sec} onClick={() => perms({ autoDeleteSec: sec })} className="px-3.5 py-1.5 rounded-full text-[14px]" style={{ background: (chat.autoDeleteSec ?? 0) === sec ? "var(--mx-accent)" : "var(--mx-surface2)", color: (chat.autoDeleteSec ?? 0) === sec ? "var(--mx-accent-text)" : "var(--mx-text)" }}>{label}</button>
            ))}
          </div>
        </Section>
        <Section>
          <button className="w-full flex items-center justify-between px-4 py-3" onClick={() => onCounts("admins")}><span>Администраторы</span><span className="mx-muted">{Array.from(new Set([chat.createdBy, ...(chat.admins ?? [])])).length} ›</span></button>
          <button className="w-full flex items-center justify-between px-4 py-3" onClick={() => onCounts("members")}><span>{chat.type === "channel" ? "Подписчики" : "Участники"}</span><span className="mx-muted">{chat.members.length} ›</span></button>
          <button className="w-full flex items-center justify-between px-4 py-3" onClick={() => onCounts("banned")}><span>Чёрный список</span><span className="mx-muted">{chat.banned?.length ?? 0} ›</span></button>
        </Section>
        {chat.createdBy === me && (
          <Section>
            <button className="w-full px-4 py-3 text-left" style={{ color: "var(--mx-danger)" }} onClick={() => confirm(`Удалить ${kind} «${chat.title}» навсегда? Это нельзя отменить.`) && run(async () => { await mApi("members", { chatId: chat.id, action: "deleteChat" }); location.href = "/m/app"; })}>Удалить {kind}</button>
          </Section>
        )}
      </div>
    </Sheet>
  );
}

/** «Изм.» у контакта: своё имя, фамилия и заметка (видны только мне). */
export function ContactEditSheet({ open, onClose, uid, account, onSaved }: { open: boolean; onClose: () => void; uid: string; account: MAccount | null; onSaved: (c: { firstName: string; lastName: string; note: string }) => void }) {
  const { toast } = useToast();
  const [f, setF] = useState({ firstName: "", lastName: "", note: "" });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    mApi<typeof f>(`contact?uid=${encodeURIComponent(uid)}`).then((d) => setF({ firstName: d.firstName || account?.displayName || "", lastName: d.lastName, note: d.note })).catch(() => setF({ firstName: account?.displayName ?? "", lastName: "", note: "" }));
  }, [open, uid]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = async () => {
    setBusy(true);
    try {
      // имя как у человека и без фамилии/заметки — запись не нужна
      const same = f.firstName.trim() === (account?.displayName ?? "") && !f.lastName.trim() && !f.note.trim();
      const body = same ? { uid, firstName: "", lastName: "", note: "" } : { uid, ...f };
      await mApi("contact", body);
      onSaved(body);
      onClose();
    } catch (e) { toast("error", e instanceof MApiError ? e.message : "Не получилось"); } finally { setBusy(false); }
  };
  return (
    <Sheet open={open} onClose={onClose} title="Изменить контакт" full zIndex={70}>
      <div className="px-4 pb-10 space-y-3">
        <div className="flex justify-center py-2"><Avatar src={account?.photoURL} name={account?.displayName ?? "?"} seed={uid} size={96} /></div>
        <div className="mx-card">
          <input className="w-full px-4 py-3 bg-transparent outline-none" placeholder="Имя" value={f.firstName} maxLength={40} onChange={(e) => setF({ ...f, firstName: e.target.value })} />
          <input className="w-full px-4 py-3 bg-transparent outline-none" placeholder="Фамилия" value={f.lastName} maxLength={40} onChange={(e) => setF({ ...f, lastName: e.target.value })} />
        </div>
        <textarea className="mx-input" rows={3} maxLength={200} placeholder="Заметка" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
        <p className="mx-muted text-[13px] px-2">Имя и заметку видите только вы.</p>
        <button className="mx-btn w-full" onClick={save} disabled={busy || !f.firstName.trim()}>Сохранить</button>
      </div>
    </Sheet>
  );
}
