"use client";

import { useState } from "react";
import { Crown, LogOut, UserPlus, UserMinus } from "lucide-react";
import { useToast } from "@/lib/toastContext";
import { mApi, MApiError } from "./api";
import { Avatar, Sheet, VerifiedBadge } from "./ui";
import { PersonRow, usePeopleSearch } from "./NewChatSheet";
import { MAccount, MChat } from "./mtypes";
import { chatPhoto, chatTitle, isSavedMessages, lastSeenText, peerUid, plural } from "./util";

export function ChatInfoSheet({
  open,
  onClose,
  chat,
  me,
  accounts,
  peer,
  isAdmin,
  onLeave,
}: {
  open: boolean;
  onClose: () => void;
  chat: MChat;
  me: string;
  accounts: Record<string, MAccount | null | undefined>;
  peer: MAccount | null;
  isAdmin: boolean;
  onLeave: () => void;
}) {
  const { toast } = useToast();
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState("");
  const { results } = usePeopleSearch(q, adding);
  const title = chatTitle(chat, me, accounts);
  const photo = chatPhoto(chat, me, accounts);
  const saved = isSavedMessages(chat, me);

  const members = async (body: { add?: string[]; remove?: string[] }) => {
    try {
      await mApi("chats/members", { chatId: chat.id, ...body });
      setAdding(false);
      setQ("");
    } catch (err) {
      toast("error", err instanceof MApiError ? err.message : "Не удалось изменить состав");
    }
  };

  return (
    <Sheet open={open} onClose={() => { onClose(); setAdding(false); }} full>
      <div className="flex flex-col items-center pt-3 pb-5 px-6">
        <Avatar src={photo} name={title} seed={chat.type === "dm" ? peerUid(chat, me) : chat.id} size={96}>
          {saved ? "🔖" : undefined}
        </Avatar>
        <p className="text-[21px] font-semibold mt-3 flex items-center gap-1.5">
          {title} {chat.type === "dm" && peer?.verified && <VerifiedBadge size={18} />}
        </p>
        {chat.type === "dm" && !saved && <p className="mx-muted text-[14px]">{lastSeenText(peer)}</p>}
        {chat.type !== "dm" && <p className="mx-muted text-[14px]">{chat.members.length} {chat.type === "channel" ? plural(chat.members.length, "подписчик", "подписчика", "подписчиков") : plural(chat.members.length, "участник", "участника", "участников")}</p>}
      </div>

      {(peer?.handle || peer?.bio || chat.description) && (
        <div className="mx-4 mb-4 mx-card" style={{ margin: "0 16px 16px" }}>
          {peer?.handle && (
            <div className="px-4 py-3"><p className="mx-muted text-[12.5px]">Имя пользователя</p><p style={{ color: "var(--mx-accent)" }}>@{peer.handle}</p></div>
          )}
          {peer?.bio && (
            <div className="px-4 py-3"><p className="mx-muted text-[12.5px]">О себе</p><p className="whitespace-pre-wrap">{peer.bio}</p></div>
          )}
          {chat.description && (
            <div className="px-4 py-3"><p className="mx-muted text-[12.5px]">Описание</p><p className="whitespace-pre-wrap">{chat.description}</p></div>
          )}
        </div>
      )}

      {chat.type !== "dm" && (
        <div className="mb-4" style={{ margin: "0 16px 16px" }}>
          <p className="mx-muted text-[13px] uppercase tracking-wide px-3 mb-1.5">Участники</p>
          <div className="mx-card">
            {isAdmin && !adding && (
              <button onClick={() => setAdding(true)} className="w-full flex items-center gap-3 px-4 py-3 text-left" style={{ color: "var(--mx-accent)" }}>
                <UserPlus size={22} /> Добавить участников
              </button>
            )}
            {adding && (
              <div className="p-3">
                <input className="mx-input" placeholder="Имя или @username" value={q} onChange={(e) => setQ(e.target.value)} autoFocus autoCapitalize="none" />
                {results.filter((r) => !chat.members.includes(r.uid)).map((a) => (
                  <PersonRow key={a.uid} acc={a} onPress={() => members({ add: [a.uid] })} />
                ))}
              </div>
            )}
            {chat.members.map((uid) => {
              const a = accounts[uid];
              const admin = chat.admins?.includes(uid) || chat.createdBy === uid;
              return (
                <div key={uid} className="flex items-center gap-3 px-4 py-2.5">
                  <Avatar src={a?.photoURL} name={a?.displayName ?? "?"} seed={uid} size={42} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate">{a?.displayName ?? "Участник"}{uid === me ? " (вы)" : ""}</p>
                    <p className="text-[12.5px] mx-muted">{a ? `@${a.handle}` : ""}</p>
                  </div>
                  {admin && <span className="text-[12px] flex items-center gap-1" style={{ color: "var(--mx-accent)" }}><Crown size={13} /> админ</span>}
                  {isAdmin && uid !== me && !admin && (
                    <button onClick={() => confirm("Удалить участника?") && members({ remove: [uid] })} className="p-1.5 mx-muted" aria-label="Удалить"><UserMinus size={19} /></button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {chat.type !== "dm" && (
        <button onClick={() => { onClose(); onLeave(); }} className="flex items-center gap-2 px-7 py-3 pb-10" style={{ color: "var(--mx-danger)" }}>
          <LogOut size={19} /> {chat.type === "channel" ? "Отписаться" : "Покинуть группу"}
        </button>
      )}
    </Sheet>
  );
}
