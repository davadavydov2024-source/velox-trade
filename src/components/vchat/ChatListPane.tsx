"use client";

import { useMemo, useState } from "react";
import { Archive, BellOff, Bell, Camera, ChevronDown, ChevronRight, Check, CheckCheck, Folder, Pin, PinOff, Search, SquarePen, X, CheckCheck as ReadIcon } from "lucide-react";
import { useToast } from "@/lib/toastContext";
import { mApi, MApiError } from "./api";
import { Avatar, MenuList, Sheet, VerifiedBadge } from "./ui";
import { SwipeRow, SwipeAction } from "./SwipeRow";
import { StoriesRow, StoryGroup } from "./Stories";
import { PersonRow, usePeopleSearch } from "./NewChatSheet";
import { useAccounts, useNow } from "./hooks";
import { MAccount, MChat, MFolder, MUserChat } from "./mtypes";
import { chatPhoto, chatTitle, formatListTime, isChatMuted, isOnline, isSavedMessages, peerUid, previewText } from "./util";

export function chatInFolder(chat: MChat, uc: MUserChat | undefined, folder: MFolder): boolean {
  if (uc?.folderIds?.includes(folder.id)) return true;
  if (folder.chatIds?.includes(chat.id)) return true;
  if (folder.includeTypes?.includes(chat.type)) return true;
  if (folder.includeTypes?.includes("unread") && (uc?.unread ?? 0) > 0) return true;
  return false;
}

export function totalUnread(chats: MChat[], ucs: Record<string, MUserChat>): number {
  const now = Date.now();
  return chats.reduce((sum, c) => {
    const uc = ucs[c.id];
    if (!uc?.unread || uc.archived || isChatMuted(uc.muted, uc.mutedUntil, now)) return sum;
    return sum + uc.unread;
  }, 0);
}

function readDraft(chatId: string): string {
  try {
    return localStorage.getItem(`vc-draft-${chatId}`) ?? "";
  } catch {
    return "";
  }
}

export function ChatListPane({
  me,
  myAccount,
  chats,
  userChats,
  folders,
  loading,
  activeId,
  storyGroups,
  storyAccounts,
  onOpenChat,
  onNewChat,
  onOpenStory,
  onCreateStory,
}: {
  me: string;
  myAccount: MAccount;
  chats: MChat[];
  userChats: Record<string, MUserChat>;
  folders: MFolder[];
  loading: boolean;
  activeId: string | null;
  storyGroups: StoryGroup[];
  storyAccounts: Record<string, MAccount | null>;
  onOpenChat: (id: string) => void;
  onNewChat: () => void;
  onOpenStory: (uid: string) => void;
  onCreateStory: () => void;
}) {
  const { toast } = useToast();
  const now = useNow(20_000);
  const peerIds = chats.filter((c) => c.type === "dm").map((c) => peerUid(c, me));
  const senderIds = chats.map((c) => c.lastMessage?.from).filter((x): x is string => !!x);
  const accounts = useAccounts(Array.from(new Set([...peerIds, ...senderIds])));

  const [folderId, setFolderId] = useState<string>("all");
  const [showArchive, setShowArchive] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [menuChat, setMenuChat] = useState<MChat | null>(null);
  const [folderPick, setFolderPick] = useState<MChat | null>(null);
  const [muteFor, setMuteFor] = useState<MChat[] | null>(null);
  const [q, setQ] = useState("");
  const { results: peopleResults, loading: peopleLoading } = usePeopleSearch(q, q.trim().length >= 2);

  const act = async (chatIds: string[], patch: Record<string, unknown>) => {
    const res = await Promise.allSettled(chatIds.map((id) => mApi("chat-settings", { chatId: id, ...patch })));
    const bad = res.find((r) => r.status === "rejected") as PromiseRejectedResult | undefined;
    if (bad) toast("error", bad.reason instanceof MApiError ? bad.reason.message : "Не удалось применить");
  };
  const markRead = (ids: string[]) => ids.forEach((id) => mApi("read", { chatId: id }).catch(() => {}));

  const activeFolder = folders.find((f) => f.id === folderId);
  const unreadByFolder = (f: MFolder | null) =>
    chats.filter((c) => !userChats[c.id]?.archived && (!f || chatInFolder(c, userChats[c.id], f))).reduce((s, c) => s + ((userChats[c.id]?.unread ?? 0) > 0 ? 1 : 0), 0);

  const visible = useMemo(() => {
    const list = chats.filter((c) => {
      const uc = userChats[c.id];
      if (uc?.archived) return false;
      if (activeFolder && !chatInFolder(c, uc, activeFolder)) return false;
      return true;
    });
    return list.sort((a, b) => {
      const ua = userChats[a.id];
      const ub = userChats[b.id];
      if (!!ua?.pinned !== !!ub?.pinned) return ua?.pinned ? -1 : 1;
      if (ua?.pinned && ub?.pinned) return (ub.pinnedAt ?? 0) - (ua.pinnedAt ?? 0);
      return (b.lastMessage?.at ?? b.updatedAt ?? 0) - (a.lastMessage?.at ?? a.updatedAt ?? 0);
    });
  }, [chats, userChats, activeFolder]);

  const archived = chats.filter((c) => userChats[c.id]?.archived);
  const archivedUnread = archived.reduce((s, c) => s + (userChats[c.id]?.unread ?? 0), 0);

  const searching = q.trim().length > 0;
  const chatMatches = searching
    ? chats.filter((c) => chatTitle(c, me, accounts).toLowerCase().includes(q.trim().toLowerCase().replace(/^@/, "")))
    : [];

  const toggleSel = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const row = (c: MChat) => {
    const uc = userChats[c.id];
    const title = chatTitle(c, me, accounts);
    const saved = isSavedMessages(c, me);
    const peer = c.type === "dm" ? accounts[peerUid(c, me)] : null;
    const muted = isChatMuted(uc?.muted, uc?.mutedUntil, now);
    const unread = uc?.unread ?? 0;
    const last = c.lastMessage;
    const typing = false; // «печатает» берётся из подколлекции чата только в открытом чате (см. ChatView)
    const draft = activeId === c.id ? "" : readDraft(c.id);
    const mineLast = last?.from === me;
    const readByPeer = mineLast && last ? (c.type === "dm" ? (c.readBy?.[peerUid(c, me)] ?? 0) >= last.at : c.members.some((u) => u !== me && (c.readBy?.[u] ?? 0) >= last.at)) : false;
    const senderName = last && c.type !== "dm" && !mineLast ? accounts[last.from]?.displayName?.split(" ")[0] : mineLast && c.type !== "dm" ? "Вы" : "";
    const preview = last ? previewText(last.kind, last.text) : c.type === "channel" ? "Канал создан" : "Нет сообщений";

    const left: SwipeAction[] = [
      { label: uc?.pinned ? "Открепить" : "Закрепить", icon: uc?.pinned ? <PinOff size={21} /> : <Pin size={21} />, color: "#ff9500", onPress: () => act([c.id], { pinned: !uc?.pinned }) },
      { label: muted ? "Звук" : "Без звука", icon: muted ? <Bell size={21} /> : <BellOff size={21} />, color: "#5856d6", onPress: () => (muted ? act([c.id], { muted: false, mutedUntil: 0 }) : setMuteFor([c])) },
      { label: "Архив", icon: <Archive size={21} />, color: "#8e8e93", onPress: () => act([c.id], { archived: true }) },
    ];
    const right: SwipeAction | undefined = unread > 0 ? { label: "Прочитано", icon: <ReadIcon size={21} />, color: "#3390ec", onPress: () => markRead([c.id]) } : undefined;

    return (
      <SwipeRow
        key={c.id}
        leftActions={editMode ? [] : left}
        rightAction={editMode ? undefined : right}
        disabled={editMode}
        onClick={() => (editMode ? toggleSel(c.id) : onOpenChat(c.id))}
        onLongPress={() => !editMode && setMenuChat(c)}
      >
        <div className="flex items-center gap-3 px-4 py-2.5" style={{ background: activeId === c.id ? "var(--vc-surface)" : "var(--vc-bg)" }}>
          {editMode && (
            <span className="w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0" style={{ borderColor: selected.has(c.id) ? "var(--vc-accent)" : "var(--vc-muted)", background: selected.has(c.id) ? "var(--vc-accent)" : "transparent" }}>
              {selected.has(c.id) && <Check size={14} color="var(--vc-accent-text)" />}
            </span>
          )}
          <Avatar src={chatPhoto(c, me, accounts)} name={title} seed={c.type === "dm" ? peerUid(c, me) : c.id} size={56} online={isOnline(peer, now)}>
            {saved ? "🔖" : undefined}
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="font-semibold truncate text-[16.5px] flex items-center gap-1">
                {title} {peer?.verified && <VerifiedBadge size={14} />}
              </p>
              {muted && <BellOff size={13} className="vc-muted shrink-0" />}
              <span className="ml-auto flex items-center gap-1 shrink-0 text-[13px] vc-muted">
                {mineLast && last && (readByPeer || saved ? <CheckCheck size={16} style={{ color: "var(--vc-accent)" }} /> : <Check size={16} />)}
                {last ? formatListTime(last.at, now) : ""}
              </span>
            </div>
            <div className="flex items-start gap-2 mt-0.5">
              <p className="text-[14.5px] vc-muted flex-1 min-w-0" style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", lineHeight: 1.3 }}>
                {typing ? (
                  <span style={{ color: "var(--vc-accent)" }}>печатает…</span>
                ) : draft ? (
                  <>
                    <span style={{ color: "var(--vc-danger)" }}>Черновик: </span>
                    {draft}
                  </>
                ) : (
                  <>
                    {senderName && <span style={{ color: "var(--vc-text)" }}>{senderName}: </span>}
                    {preview}
                  </>
                )}
              </p>
              {unread > 0 ? (
                <span className={`vc-badge shrink-0 ${muted ? "muted" : ""}`}>{unread > 99 ? "99+" : unread}</span>
              ) : uc?.pinned ? (
                <Pin size={16} className="vc-muted shrink-0 mt-0.5" style={{ transform: "rotate(45deg)" }} />
              ) : null}
            </div>
          </div>
        </div>
      </SwipeRow>
    );
  };

  const selectedIds = Array.from(selected);
  const exitEdit = () => {
    setEditMode(false);
    setSelected(new Set());
  };
  const bulk = async (patch: Record<string, unknown>) => {
    await act(selectedIds, patch);
    exitEdit();
  };

  return (
    <div className="flex flex-col h-full" style={{ background: "var(--vc-bg)" }}>
      {/* ---- шапка ---- */}
      <div className="vc-safe-top shrink-0">
        <div className="h-12 flex items-center px-3 relative">
          <button onClick={() => (editMode ? exitEdit() : setEditMode(true))} className="text-[16px] px-2 py-1.5" style={{ color: "var(--vc-accent)" }}>
            {editMode ? "Готово" : "Изм."}
          </button>
          <p className="absolute left-1/2 -translate-x-1/2 font-semibold text-[17px] pointer-events-none">Чаты</p>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={onCreateStory} className="w-9 h-9 rounded-full vc-glass flex items-center justify-center" style={{ color: "var(--vc-accent)" }} aria-label="Новая история">
              <Camera size={18} />
            </button>
            <button onClick={onNewChat} className="w-9 h-9 rounded-full vc-glass flex items-center justify-center" style={{ color: "var(--vc-accent)" }} aria-label="Новое сообщение">
              <SquarePen size={18} />
            </button>
          </div>
        </div>
      </div>

      <div className="vc-scroll flex-1 min-h-0" style={{ paddingBottom: editMode ? 70 : 96 }}>
        {storyGroups.length > 0 || true ? (
          <StoriesRow groups={storyGroups} me={me} myAccount={myAccount} accounts={storyAccounts} onOpen={onOpenStory} onCreate={onCreateStory} />
        ) : null}

        {/* поиск */}
        <div className="px-4 pb-2 pt-1">
          <div className="flex items-center gap-2 rounded-[14px] px-3 h-10" style={{ background: "var(--vc-surface)" }}>
            <Search size={17} className="vc-muted" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск чатов и людей" className="bg-transparent outline-none flex-1 text-[16px]" autoCapitalize="none" />
            {q && <button onClick={() => setQ("")} className="vc-muted" aria-label="Очистить"><X size={17} /></button>}
          </div>
        </div>

        {searching ? (
          <div>
            {chatMatches.length > 0 && <p className="vc-muted text-[13px] uppercase tracking-wide px-5 py-1.5">Чаты</p>}
            {chatMatches.map(row)}
            {q.trim().length >= 2 && (
              <>
                <p className="vc-muted text-[13px] uppercase tracking-wide px-5 py-1.5">Люди</p>
                {peopleResults.filter((a) => a.uid !== me).map((a) => (
                  <PersonRow
                    key={a.uid}
                    acc={a}
                    onPress={async () => {
                      try {
                        const res = await mApi<{ chatId?: string; id?: string }>("chats", { type: "dm", members: [a.uid] });
                        const id = res.chatId ?? res.id;
                        if (id) {
                          setQ("");
                          onOpenChat(id);
                        }
                      } catch (err) {
                        toast("error", err instanceof MApiError ? err.message : "Не удалось открыть чат");
                      }
                    }}
                  />
                ))}
                {!peopleLoading && peopleResults.length === 0 && chatMatches.length === 0 && <p className="vc-muted text-center py-8">Ничего не найдено</p>}
              </>
            )}
          </div>
        ) : (
          <>
            {/* папки */}
            {folders.length > 0 && (
              <div className="px-4 pb-2">
                <div className="vc-glass rounded-full p-1 flex gap-1 overflow-x-auto vc-noscrollbar">
                  {[{ id: "all", name: "Все", emoji: "" } as MFolder, ...folders].map((f) => {
                    const on = f.id === folderId;
                    const count = f.id === "all" ? unreadByFolder(null) : unreadByFolder(f);
                    return (
                      <button
                        key={f.id}
                        onClick={() => setFolderId(f.id)}
                        className="px-3.5 h-8 rounded-full text-[14px] font-medium whitespace-nowrap flex items-center gap-1.5 shrink-0"
                        style={{ background: on ? "var(--vc-surface2)" : "transparent", color: on ? "var(--vc-text)" : "var(--vc-muted)" }}
                      >
                        {f.emoji} {f.name}
                        {count > 0 && <span className="vc-badge" style={{ minWidth: 18, height: 18, fontSize: 11 }}>{count}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* архив */}
            {archived.length > 0 && (
              <>
                <button onClick={() => setArchiveOpen((v) => !v)} className="w-full flex items-center gap-3 px-4 py-2.5 text-left">
                  <span className="w-14 h-14 rounded-full flex items-center justify-center text-white" style={{ background: "#8e8e93" }}><Archive size={24} /></span>
                  <span className="flex-1 font-semibold text-[16.5px]">Архив чатов</span>
                  {archivedUnread > 0 && <span className="vc-badge muted">{archivedUnread}</span>}
                  {archiveOpen ? <ChevronDown size={18} className="vc-muted" /> : <ChevronRight size={18} className="vc-muted" />}
                </button>
                {archiveOpen && archived.map(row)}
              </>
            )}

            {loading && chats.length === 0 && <p className="vc-muted text-center py-10">Загрузка…</p>}
            {visible.map(row)}
            {!loading && visible.length === 0 && archived.length === 0 && (
              <div className="text-center px-10 py-14">
                <p className="text-[17px] font-semibold mb-1.5">Чатов пока нет</p>
                <p className="vc-muted text-[14px] mb-5">Найди человека по @username или создай группу.</p>
                <button className="vc-btn" style={{ width: "auto", padding: "12px 24px" }} onClick={onNewChat}>Новое сообщение</button>
              </div>
            )}
          </>
        )}
      </div>

      {editMode && (
        <div className="absolute inset-x-0 bottom-0 vc-glass vc-safe-bottom flex" style={{ borderWidth: "1px 0 0", zIndex: 20 }}>
          {[
            { label: "Прочитано", icon: <ReadIcon size={20} />, run: () => { markRead(selectedIds); exitEdit(); } },
            { label: "Закрепить", icon: <Pin size={20} />, run: () => bulk({ pinned: true }) },
            { label: "Без звука", icon: <BellOff size={20} />, run: () => { setMuteFor(chats.filter((c) => selected.has(c.id))); } },
            { label: "В архив", icon: <Archive size={20} />, run: () => bulk({ archived: true }) },
          ].map((b) => (
            <button key={b.label} disabled={selected.size === 0} onClick={b.run} className="flex-1 flex flex-col items-center gap-1 py-2.5 text-[11.5px] disabled:opacity-35" style={{ color: "var(--vc-accent)" }}>
              {b.icon}
              {b.label}
            </button>
          ))}
        </div>
      )}

      {/* контекстное меню чата */}
      <Sheet open={!!menuChat} onClose={() => setMenuChat(null)} title={menuChat ? chatTitle(menuChat, me, accounts) : undefined}>
        {menuChat && (() => {
          const uc = userChats[menuChat.id];
          const muted = isChatMuted(uc?.muted, uc?.mutedUntil, now);
          return (
            <MenuList
              onDone={() => setMenuChat(null)}
              items={[
                { label: uc?.pinned ? "Открепить" : "Закрепить", icon: uc?.pinned ? <PinOff size={20} /> : <Pin size={20} />, onPress: () => act([menuChat.id], { pinned: !uc?.pinned }) },
                muted
                  ? { label: "Включить звук", icon: <Bell size={20} />, onPress: () => act([menuChat.id], { muted: false, mutedUntil: 0 }) }
                  : { label: "Без звука", icon: <BellOff size={20} />, onPress: () => setMuteFor([menuChat]) },
                { label: "Прочитано", icon: <ReadIcon size={20} />, hidden: !(uc?.unread), onPress: () => markRead([menuChat.id]) },
                { label: "В папку", icon: <Folder size={20} />, hidden: folders.length === 0, onPress: () => setFolderPick(menuChat) },
                { label: uc?.archived ? "Вернуть из архива" : "В архив", icon: <Archive size={20} />, onPress: () => act([menuChat.id], { archived: !uc?.archived }) },
              ]}
            />
          );
        })()}
      </Sheet>

      {/* выбор времени для «без звука» */}
      <Sheet open={!!muteFor} onClose={() => setMuteFor(null)} title="Отключить уведомления">
        {muteFor && (
          <MenuList
            onDone={() => { setMuteFor(null); exitEdit(); }}
            items={[
              { label: "На 1 час", ms: 3_600_000 },
              { label: "На 8 часов", ms: 8 * 3_600_000 },
              { label: "На 2 дня", ms: 2 * 86_400_000 },
              { label: "Навсегда", ms: 0 },
            ].map((o) => ({ label: o.label, icon: <BellOff size={20} />, onPress: () => act(muteFor.map((c) => c.id), { muted: true, mutedUntil: o.ms ? Date.now() + o.ms : 0 }) }))}
          />
        )}
      </Sheet>

      {/* выбор папки для чата */}
      <Sheet open={!!folderPick} onClose={() => setFolderPick(null)} title="Папки чата">
        {folderPick && (
          <div className="pb-4">
            {folders.map((f) => {
              const inList = !!userChats[folderPick.id]?.folderIds?.includes(f.id);
              return (
                <button
                  key={f.id}
                  onClick={() => {
                    const cur = userChats[folderPick.id]?.folderIds ?? [];
                    act([folderPick.id], { folderIds: inList ? cur.filter((x) => x !== f.id) : [...cur, f.id] });
                    setFolderPick(null);
                  }}
                  className="w-full flex items-center gap-3 px-5 py-3.5 text-left"
                >
                  <span className="text-xl w-7">{f.emoji || "📁"}</span>
                  <span className="flex-1">{f.name}</span>
                  {inList && <Check size={20} style={{ color: "var(--vc-accent)" }} />}
                </button>
              );
            })}
          </div>
        )}
      </Sheet>
    </div>
  );
}
