"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, doc, onSnapshot, query, where } from "firebase/firestore";
import { MessageCircle, Settings as SettingsIcon } from "lucide-react";
import { auth, db } from "@/lib/firebase";
import { signOut } from "firebase/auth";
import { useAuth } from "@/lib/authContext";
import { useToast } from "@/lib/toastContext";
import type { MessengerAccount, MessengerChat, MessengerFolder, MessengerUserChat } from "@/lib/messenger/types";
import { allUnread } from "@/lib/messenger/folders";
import { MApiError, getDeviceId, mApi, setCachedAccount, useAccounts } from "@/lib/messenger/client";
import { AuthScreens, JoinScreen } from "./AuthScreens";
import { ChatList } from "./ChatList";
import { ChatView } from "./ChatView";
import { NewChat } from "./NewChat";
import { StickerPackSheet } from "./ChatExtras";
import { SettingsPanel } from "./SettingsPanel";
import { Splash, UnreadBadge, cx } from "./mui";

export default function MessengerApp({ initialChat, joinParam, stickersParam = null }: { initialChat: string | null; joinParam: string | null; stickersParam?: string | null }) {
  const { user, loading, profile } = useAuth();
  const [acc, setAcc] = useState<MessengerAccount | null | undefined>(undefined);

  useEffect(() => {
    if (!user) { setAcc(undefined); return; }
    return onSnapshot(doc(db, "messengerAccounts", user.uid), (s) => {
      const a = s.exists() ? (s.data() as MessengerAccount) : null;
      if (a) setCachedAccount(a);
      setAcc(a);
    }, () => setAcc(null));
  }, [user]);

  if (loading || (user && acc === undefined)) return <Splash />;
  if (!user) return <AuthScreens />;
  if (!acc) return <JoinScreen defaultName={profile?.displayName ?? user.displayName ?? ""} onLogout={() => signOut(auth)} />;
  if (acc.banned) return <div className="h-full flex items-center justify-center text-center px-6 text-white/60">Доступ к MiliGram для этого аккаунта закрыт.</div>;
  return <Messenger uid={user.uid} account={acc} initialChat={initialChat} joinParam={joinParam} stickersParam={stickersParam} />;
}

function Messenger({ uid, account, initialChat, joinParam, stickersParam }: { uid: string; account: MessengerAccount; initialChat: string | null; joinParam: string | null; stickersParam: string | null }) {
  const { toast } = useToast();
  const [chats, setChats] = useState<MessengerChat[]>([]);
  const [ucs, setUcs] = useState<Record<string, MessengerUserChat>>({});
  const [folders, setFolders] = useState<MessengerFolder[]>([]);
  const [activeId, setActiveId] = useState<string | null>(initialChat);
  const [view, setView] = useState<"chats" | "settings">("chats");
  const [newOpen, setNewOpen] = useState(false);
  const [packSlug, setPackSlug] = useState<string | null>(stickersParam);

  // Регистрируем это устройство (при новом входе приходит уведомление от «MiliGram Push»)
  useEffect(() => { mApi("session", { deviceId: getDeviceId() }).catch(() => {}); }, []);

  useEffect(() => onSnapshot(query(collection(db, "messengerChats"), where("members", "array-contains", uid)), (s) => setChats(s.docs.map((d) => ({ id: d.id, ...d.data() }) as MessengerChat)), (e) => console.error("chats", e)), [uid]);
  useEffect(() => onSnapshot(collection(db, "messengerUserChats", uid, "chats"), (s) => { const m: Record<string, MessengerUserChat> = {}; s.docs.forEach((d) => (m[d.id] = d.data() as MessengerUserChat)); setUcs(m); }, () => {}), [uid]);
  useEffect(() => onSnapshot(collection(db, "messengerUserFolders", uid, "folders"), (s) => setFolders(s.docs.map((d) => ({ id: d.id, ...d.data() }) as MessengerFolder).sort((a, b) => (a.order ?? 0) - (b.order ?? 0))), () => {}), [uid]);

  // Ссылка-приглашение /m?join=@канал или /m?join=<код>
  useEffect(() => {
    if (!joinParam) return;
    (async () => {
      try {
        const p = joinParam.startsWith("@") ? `handle=${encodeURIComponent(joinParam)}` : `code=${encodeURIComponent(joinParam)}`;
        const info = await mApi<{ chatId: string; title: string; isMember: boolean }>(`channel-preview?${p}`);
        if (!info.isMember) {
          if (!confirm(`Вступить в «${info.title}»?`)) return;
          const r = await mApi<{ chatId: string; requested?: boolean }>("join-chat", joinParam.startsWith("@") ? { handle: joinParam } : { code: joinParam });
          if (r.requested) return toast("success", "Заявка отправлена админам");
        }
        setActiveId(info.chatId);
      } catch (e: any) { toast("error", e instanceof MApiError ? e.message : "Ссылка недействительна"); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joinParam]);

  useEffect(() => { history.replaceState(history.state, "", activeId ? `/m?chat=${activeId}` : "/m"); }, [activeId]);

  const accUids = useMemo(() => Array.from(new Set(chats.flatMap((c) => (c.type === "dm" ? c.members : [c.lastMessage?.from ?? ""])).filter(Boolean))).slice(0, 200), [chats]);
  const accs = useAccounts(accUids);
  const active = chats.find((c) => c.id === activeId) ?? null;
  const unread = allUnread(chats, ucs).chats;

  async function openPerson(handle: string) {
    try { setActiveId((await mApi<{ chatId: string }>("chats", { type: "dm", memberHandles: [handle] })).chatId); } catch (e: any) { toast("error", e?.message || "Не удалось открыть чат"); }
  }

  return (
    <div className="h-full flex">
      <div className={cx("h-full w-full lg:w-[380px] lg:border-r border-border flex flex-col", activeId && "hidden lg:flex")}>
        {view === "chats"
          ? <ChatList uid={uid} chats={chats} ucs={ucs} folders={folders} accs={accs} activeId={activeId} onOpen={setActiveId} onNew={() => setNewOpen(true)} onOpenPerson={openPerson} />
          : <SettingsPanel uid={uid} account={account} folders={folders} />}
        <nav className="shrink-0 flex border-t border-border bg-surface/80" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
          {([["chats", "Чаты", MessageCircle], ["settings", "Настройки", SettingsIcon]] as const).map(([id, label, Icon]) => (
            <button key={id} onClick={() => setView(id)} className={cx("flex-1 flex flex-col items-center gap-0.5 py-2 text-[11px] relative", view === id ? "text-accent" : "text-white/50")}>
              <Icon size={22} /> {label}
              {id === "chats" && unread > 0 && <span className="absolute top-1 left-[55%]"><UnreadBadge n={unread} /></span>}
            </button>
          ))}
        </nav>
      </div>

      <div className={cx("h-full flex-1 min-w-0", !activeId && "hidden lg:flex")}>
        {activeId && active ? (
          <ChatView key={active.id} uid={uid} account={account} chat={active} uc={ucs[active.id]} allChats={chats} ucs={ucs} onBack={() => setActiveId(null)} />
        ) : activeId ? (
          <Splash />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-white/30 gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/miligram/icon-192.png" alt="" className="w-24 h-24 rounded-[24px] opacity-60" />
            <p className="text-sm">Выбери чат или начни новый</p>
          </div>
        )}
      </div>

      {packSlug && <StickerPackSheet slug={packSlug} onClose={() => setPackSlug(null)} />}
      {newOpen && <NewChat myHandle={account.handle} onClose={() => setNewOpen(false)} onOpen={setActiveId} />}
    </div>
  );
}
