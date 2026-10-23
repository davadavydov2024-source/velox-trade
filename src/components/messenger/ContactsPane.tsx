"use client";

import { useState } from "react";
import { Megaphone, Search, UserPlus, Users } from "lucide-react";
import { useToast } from "@/lib/toastContext";
import { mApi, MApiError } from "./api";
import { IconBox, PageHeader, Spinner } from "./ui";
import { PersonRow, usePeopleSearch } from "./NewChatSheet";
import { useAccounts } from "./hooks";
import { MAccount, MChat } from "./mtypes";
import { peerUid } from "./util";

export function ContactsPane({ me, chats, onOpenChat, onNewChat }: { me: string; chats: MChat[]; onOpenChat: (id: string) => void; onNewChat: () => void }) {
  const { toast } = useToast();
  const [q, setQ] = useState("");
  const dmPeers = chats.filter((c) => c.type === "dm" && peerUid(c, me) !== me).map((c) => peerUid(c, me));
  const accounts = useAccounts(dmPeers);
  const { results, loading } = usePeopleSearch(q, q.trim().length >= 2);
  const known = dmPeers.map((u) => accounts[u]).filter((a): a is MAccount => !!a).sort((a, b) => a.displayName.localeCompare(b.displayName, "ru"));

  const openDm = async (a: MAccount) => {
    try {
      const res = await mApi<{ chatId?: string; id?: string }>("chats", { type: "dm", members: [a.uid] });
      const id = res.chatId ?? res.id;
      if (id) onOpenChat(id);
    } catch (err) {
      toast("error", err instanceof MApiError ? err.message : "Не удалось открыть чат");
    }
  };

  const list = q.trim().length >= 2 ? results.filter((a) => a.uid !== me) : known;
  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Контакты" right={<button onClick={onNewChat} style={{ color: "var(--mx-accent)" }} aria-label="Новый чат"><UserPlus size={22} /></button>} />
      <div className="px-4 pb-2">
        <div className="flex items-center gap-2 rounded-[14px] px-3 h-10" style={{ background: "var(--mx-surface)" }}>
          <Search size={17} className="mx-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Найти по имени или @username" className="bg-transparent outline-none flex-1 text-[16px]" autoCapitalize="none" />
          {loading && <Spinner size={16} />}
        </div>
      </div>
      <div className="mx-scroll flex-1 pb-28">
        {q.trim().length < 2 && (
          <>
            <button onClick={onNewChat} className="w-full flex items-center gap-3.5 px-4 py-2.5 text-left"><IconBox color="#34c759"><Users size={17} /></IconBox><span style={{ color: "var(--mx-accent)" }}>Создать группу</span></button>
            <button onClick={onNewChat} className="w-full flex items-center gap-3.5 px-4 py-2.5 text-left mb-1"><IconBox color="#ff9500"><Megaphone size={17} /></IconBox><span style={{ color: "var(--mx-accent)" }}>Создать канал</span></button>
            <p className="mx-muted text-[13px] uppercase tracking-wide px-5 py-1.5">Ваши собеседники</p>
          </>
        )}
        {list.map((a) => <PersonRow key={a.uid} acc={a} onPress={() => openDm(a)} />)}
        {q.trim().length < 2 && known.length === 0 && <p className="mx-muted text-center py-10 px-10 text-[14px]">Здесь появятся люди, с которыми ты переписываешься. Найди кого-нибудь по @username.</p>}
        {q.trim().length >= 2 && !loading && list.length === 0 && <p className="mx-muted text-center py-10">Никого не найдено</p>}
      </div>
    </div>
  );
}
