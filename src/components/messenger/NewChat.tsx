"use client";

import { useEffect, useState } from "react";
import { Bookmark, Megaphone, Users, X, MessageCircle } from "lucide-react";
import { useToast } from "@/lib/toastContext";
import { mApi } from "@/lib/messenger/client";
import { Avatar, Sheet, cx } from "./mui";

type Person = { uid: string; handle: string; displayName: string; photoURL: string | null };
type Channel = { chatId: string; handle: string; title: string; description: string; photoURL: string | null; subscribers: number };

export function NewChat({ myHandle, onClose, onOpen }: { myHandle: string; onClose: () => void; onOpen: (chatId: string) => void }) {
  const { toast } = useToast();
  const [mode, setMode] = useState<"dm" | "group" | "channel">("dm");
  const [q, setQ] = useState("");
  const [people, setPeople] = useState<Person[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [picked, setPicked] = useState<Person[]>([]);
  const [title, setTitle] = useState("");
  const [handle, setHandle] = useState("");
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = q.trim().replace(/^@/, "");
    if (t.length < 2) { setPeople([]); setChannels([]); return; }
    const h = setTimeout(() => {
      mApi<{ users: Person[] }>(`search?q=${encodeURIComponent(t)}`).then((d) => setPeople(d.users)).catch(() => setPeople([]));
      if (mode === "dm") mApi<{ channels: Channel[] }>(`channel-search?q=${encodeURIComponent(t)}`).then((d) => setChannels(d.channels)).catch(() => setChannels([]));
    }, 350);
    return () => clearTimeout(h);
  }, [q, mode]);

  async function run(fn: () => Promise<string>) {
    setBusy(true);
    try { onOpen(await fn()); onClose(); } catch (e: any) { toast("error", e?.message || "Не получилось"); setBusy(false); }
  }
  const dm = (handle: string) => run(async () => (await mApi<{ chatId: string }>("chats", { type: "dm", memberHandles: [handle] })).chatId);
  const joinChannel = (c: Channel) => run(async () => (await mApi<{ chatId: string }>("join-chat", { handle: c.handle })).chatId);
  const createGroup = () => run(async () => (await mApi<{ chatId: string }>("chats", { type: "group", title, memberHandles: picked.map((p) => p.handle) })).chatId);
  const createChannel = () => run(async () => (await mApi<{ chatId: string }>("chats", { type: "channel", title, description: desc, handle: handle || undefined })).chatId);

  const modes = [["dm", "Чат", MessageCircle], ["group", "Группа", Users], ["channel", "Канал", Megaphone]] as const;
  return (
    <Sheet onClose={onClose} title="Новый чат">
      <div className="px-5 pb-5 space-y-3">
        <div className="flex gap-2">
          {modes.map(([id, label, Icon]) => (
            <button key={id} onClick={() => { setMode(id); setPicked([]); }} className={cx("flex-1 py-2 rounded-xl text-sm flex items-center justify-center gap-1.5", mode === id ? "bg-accent text-black font-medium" : "bg-white/5 text-white/70")}><Icon size={15} /> {label}</button>
          ))}
        </div>

        {mode === "dm" && (
          <button disabled={busy} onClick={() => dm(myHandle)} className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-white/5">
            <span className="w-11 h-11 rounded-full bg-gradient-to-br from-sky-400 to-blue-500 flex items-center justify-center"><Bookmark size={20} /></span>
            <span className="font-medium">Избранное</span>
          </button>
        )}

        {mode === "channel" ? (
          <div className="space-y-2.5">
            <input autoComplete="off" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Название канала" maxLength={60} className="input-field" />
            <input autoComplete="off" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Описание (необязательно)" maxLength={300} className="input-field" />
            <input autoComplete="off" value={handle} onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/^@/, ""))} placeholder="@адрес — чтобы канал был публичным (необязательно)" maxLength={24} className="input-field" />
            <button disabled={busy || title.trim().length < 2} onClick={createChannel} className="btn-primary w-full py-3 disabled:opacity-50">Создать канал</button>
          </div>
        ) : (
          <>
            {mode === "group" && (
              <>
                <input autoComplete="off" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Название группы" maxLength={60} className="input-field" />
                {picked.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {picked.map((p) => <button key={p.uid} onClick={() => setPicked((l) => l.filter((x) => x.uid !== p.uid))} className="flex items-center gap-1 pl-1 pr-2 py-1 rounded-full bg-white/10 text-sm"><Avatar name={p.displayName} src={p.photoURL} size={22} /> {p.displayName} <X size={12} /></button>)}
                  </div>
                )}
              </>
            )}
            <input autoComplete="off" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Найти по @username" className="input-field" />
            {people.map((p) => (
              <button key={p.uid} disabled={busy} onClick={() => (mode === "dm" ? dm(p.handle) : setPicked((l) => (l.some((x) => x.uid === p.uid) ? l : [...l, p])))} className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 text-left">
                <Avatar name={p.displayName} src={p.photoURL} size={44} />
                <span className="min-w-0"><span className="block font-medium truncate">{p.displayName}</span><span className="block text-xs text-white/40">@{p.handle}</span></span>
              </button>
            ))}
            {mode === "dm" && channels.length > 0 && <p className="text-xs text-white/40 pt-1">Каналы</p>}
            {mode === "dm" && channels.map((c) => (
              <button key={c.chatId} disabled={busy} onClick={() => joinChannel(c)} className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 text-left">
                <Avatar name={c.title} src={c.photoURL} size={44} />
                <span className="min-w-0"><span className="block font-medium truncate">{c.title}</span><span className="block text-xs text-white/40">@{c.handle} · {c.subscribers} подписчиков · нажми, чтобы подписаться</span></span>
              </button>
            ))}
            {mode === "group" && <button disabled={busy || picked.length === 0 || title.trim().length < 2} onClick={createGroup} className="btn-primary w-full py-3 disabled:opacity-50">Создать группу ({picked.length})</button>}
          </>
        )}
      </div>
    </Sheet>
  );
}
