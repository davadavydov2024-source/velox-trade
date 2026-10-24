"use client";

import { useEffect, useMemo, useState } from "react";
import { Archive, BadgeCheck, BellOff, Pin, Search, SquarePen, CheckCheck, Star } from "lucide-react";
import type { MessengerChat, MessengerFolder, MessengerUserChat } from "@/lib/messenger/types";
import { allUnread, chatInFolder, folderUnread } from "@/lib/messenger/folders";
import { mApi } from "@/lib/messenger/client";
import { Accs, Avatar, UnreadBadge, chatMeta, cx, fmtListTime } from "./ui";

type Person = { uid: string; handle: string; displayName: string; photoURL: string | null };

function previewText(chat: MessengerChat, uid: string, accs: Accs): string {
  const lm = chat.lastMessage;
  if (!lm) return chat.type === "channel" ? chat.description || "Канал" : "Нет сообщений";
  const who = lm.from === uid ? "Вы: " : chat.type === "group" ? `${(accs[lm.from]?.displayName ?? "").split(" ")[0]}: ` : "";
  return who + lm.text;
}

export function ChatList({ uid, chats, ucs, folders, accs, activeId, onOpen, onNew, onOpenPerson }: {
  uid: string; chats: MessengerChat[]; ucs: Record<string, MessengerUserChat>; folders: MessengerFolder[]; accs: Accs;
  activeId: string | null; onOpen: (id: string) => void; onNew: () => void; onOpenPerson: (handle: string) => void;
}) {
  const [tab, setTab] = useState("all");
  const [q, setQ] = useState("");
  const [people, setPeople] = useState<Person[]>([]);

  useEffect(() => {
    const t = q.trim().replace(/^@/, "");
    if (t.length < 2) { setPeople([]); return; }
    const h = setTimeout(() => mApi<{ users: Person[] }>(`search?q=${encodeURIComponent(t)}`).then((d) => setPeople(d.users)).catch(() => setPeople([])), 350);
    return () => clearTimeout(h);
  }, [q]);

  const archived = useMemo(() => chats.filter((c) => ucs[c.id]?.archived).length, [chats, ucs]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase().replace(/^@/, "");
    const list = chats.filter((c) => {
      const uc = ucs[c.id];
      if (tab === "archive") return !!uc?.archived;
      if (uc?.archived) return false;
      if (tab !== "all") { const f = folders.find((x) => x.id === tab); if (f && !chatInFolder(f, c, uc)) return false; }
      if (!needle) return true;
      return chatMeta(c, uid, accs).title.toLowerCase().includes(needle) || (c.lastMessage?.text ?? "").toLowerCase().includes(needle);
    });
    const pinScore = (c: MessengerChat) => (c.service ? Number.MAX_SAFE_INTEGER : ucs[c.id]?.pinned ? ucs[c.id]?.pinnedAt ?? 1 : 0);
    return list.sort((a, b) => pinScore(b) - pinScore(a) || b.updatedAt - a.updatedAt);
  }, [chats, ucs, folders, tab, q, uid, accs]);

  const tabs = [{ id: "all", name: "Все", badge: allUnread(chats, ucs).chats }, ...folders.map((f) => ({ id: f.id, name: `${f.emoji ?? ""} ${f.name}`.trim(), badge: folderUnread(f, chats, ucs).chats }))];

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="px-4 pt-3 pb-2 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Чаты</h1>
        <button onClick={onNew} aria-label="Новый чат" className="w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center"><SquarePen size={20} /></button>
      </div>
      <div className="px-4 pb-2">
        <div className="relative">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40" />
          <input autoComplete="off" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск" className="input-field py-2.5 pl-10 text-sm rounded-full" />
        </div>
      </div>
      {(tabs.length > 1 || archived > 0) && (
        <div className="px-3 pb-2 flex gap-1.5 overflow-x-auto scrollbar-none">
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} className={cx("shrink-0 px-3.5 py-1.5 rounded-full text-sm flex items-center gap-1.5", tab === t.id ? "bg-accent text-black font-medium" : "bg-white/5 text-white/70")}>
              {t.name} {t.badge > 0 && <span className={cx("text-[11px] px-1.5 rounded-full", tab === t.id ? "bg-black/20" : "bg-white/15")}>{t.badge}</span>}
            </button>
          ))}
          {archived > 0 && (
            <button onClick={() => setTab(tab === "archive" ? "all" : "archive")} className={cx("shrink-0 px-3.5 py-1.5 rounded-full text-sm flex items-center gap-1.5", tab === "archive" ? "bg-accent text-black font-medium" : "bg-white/5 text-white/70")}>
              <Archive size={14} /> Архив {archived}
            </button>
          )}
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
        {visible.map((c) => {
          const m = chatMeta(c, uid, accs);
          const uc = ucs[c.id];
          const unread = uc?.unread ?? 0;
          const muted = !!uc?.muted;
          const lm = c.lastMessage;
          const other = c.type === "dm" ? c.members.find((x) => x !== uid) : undefined;
          const read = lm?.from === uid && other && (c.readBy?.[other] ?? 0) >= lm.at;
          return (
            <button key={c.id} onClick={() => onOpen(c.id)} className={cx("w-full flex items-center gap-3 px-4 py-2.5 text-left active:bg-white/5", activeId === c.id ? "bg-white/10" : "hover:bg-white/[0.03]")}>
              <Avatar name={m.title} src={m.photoURL} size={54} />
              <div className="min-w-0 flex-1 border-b border-white/5 pb-2.5 -mb-2.5">
                <div className="flex items-center gap-1.5">
                  <p className="font-semibold truncate">{m.title}</p>
                  {(m.verified || c.service) && <BadgeCheck size={15} className="text-accent shrink-0" />}
                  {m.premium && <Star size={13} className="text-yellow-400 fill-yellow-400 shrink-0" />}
                  {muted && <BellOff size={12} className="text-white/30 shrink-0" />}
                  <span className="ml-auto flex items-center gap-1 text-[12px] text-white/40 shrink-0">
                    {lm?.from === uid && c.type === "dm" && !c.service && <CheckCheck size={15} className={read ? "text-accent" : "text-white/30"} />}
                    {fmtListTime(lm?.at ?? c.updatedAt)}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <p className="text-sm text-white/50 truncate flex-1 whitespace-pre-line line-clamp-2">{previewText(c, uid, accs)}</p>
                  {unread > 0 || uc?.markedUnread || (uc?.mentions ?? 0) > 0 ? <UnreadBadge n={uc?.markedUnread && unread === 0 ? 1 : unread} muted={muted} mention={(uc?.mentions ?? 0) > 0} /> : uc?.pinned || c.service ? <Pin size={15} className="text-white/30 shrink-0" /> : null}
                </div>
              </div>
            </button>
          );
        })}
        {visible.length === 0 && !q && <p className="text-center text-white/30 text-sm py-12 px-6">Чатов пока нет. Нажми ✎ вверху, чтобы написать кому-нибудь.</p>}
        {people.length > 0 && (
          <div className="pt-2">
            <p className="px-4 py-1.5 text-xs text-white/40">Люди</p>
            {people.map((p) => (
              <button key={p.uid} onClick={() => onOpenPerson(p.handle)} className="w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-white/[0.03]">
                <Avatar name={p.displayName} src={p.photoURL} size={44} />
                <div className="min-w-0"><p className="font-medium truncate">{p.displayName}</p><p className="text-xs text-white/40">@{p.handle}</p></div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
