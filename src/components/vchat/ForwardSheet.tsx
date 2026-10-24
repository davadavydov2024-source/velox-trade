"use client";

import { useState } from "react";
import { Check, Search } from "lucide-react";
import { Avatar, Sheet } from "./ui";
import { useAccounts } from "./hooks";
import { MChat } from "./mtypes";
import { chatPhoto, chatTitle, isSavedMessages, peerUid } from "./util";

export function ForwardSheet({
  open,
  onClose,
  chats,
  me,
  currentChatId,
  onForward,
}: {
  open: boolean;
  onClose: () => void;
  chats: MChat[];
  me: string;
  currentChatId: string;
  onForward: (chatIds: string[]) => void;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const accounts = useAccounts(chats.filter((c) => c.type === "dm").map((c) => peerUid(c, me)));
  const list = chats
    .filter((c) => (c.type !== "channel" || c.admins?.includes(me) || c.createdBy === me))
    .filter((c) => chatTitle(c, me, accounts).toLowerCase().includes(q.trim().toLowerCase()));

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  return (
    <Sheet open={open} onClose={() => { onClose(); setPicked([]); setQ(""); }} title="Переслать" full>
      <div className="px-4 pb-2">
        <div className="flex items-center gap-2 rounded-xl px-3 h-10" style={{ background: "var(--vc-surface2)" }}>
          <Search size={17} className="vc-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск" className="bg-transparent outline-none flex-1 text-[16px]" />
        </div>
      </div>
      <div className="pb-24">
        {list.map((c) => {
          const on = picked.includes(c.id);
          const title = chatTitle(c, me, accounts);
          return (
            <button key={c.id} onClick={() => toggle(c.id)} className="w-full flex items-center gap-3 px-4 py-2.5 text-left active:bg-white/5">
              <Avatar src={chatPhoto(c, me, accounts)} name={title} seed={c.type === "dm" ? peerUid(c, me) : c.id} size={44}>
                {isSavedMessages(c, me) ? "🔖" : undefined}
              </Avatar>
              <span className="flex-1 truncate">{title}{c.id === currentChatId ? " (этот чат)" : ""}</span>
              <span className="w-6 h-6 rounded-full border-2 flex items-center justify-center" style={{ borderColor: on ? "var(--vc-accent)" : "var(--vc-muted)", background: on ? "var(--vc-accent)" : "transparent" }}>
                {on && <Check size={14} color="var(--vc-accent-text)" />}
              </span>
            </button>
          );
        })}
        {list.length === 0 && <p className="vc-muted text-center py-8">Чаты не найдены</p>}
      </div>
      <div className="sticky bottom-0 p-4" style={{ background: "linear-gradient(transparent, var(--vc-surface) 35%)" }}>
        <button className="vc-btn" disabled={picked.length === 0} onClick={() => { const ids = picked; setPicked([]); setQ(""); onForward(ids); }}>
          Переслать{picked.length ? ` (${picked.length})` : ""}
        </button>
      </div>
    </Sheet>
  );
}
