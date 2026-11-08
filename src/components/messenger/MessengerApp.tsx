"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Bell, MessageCircle, MessagesSquare, Settings, Users, X } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { isPushSupported } from "@/lib/webPush";
import { AppLockGate } from "./AppLockGate";
import { NotificationGate } from "./NotificationGate";
import { mApi, MApiError } from "./api";
import { useToast } from "@/lib/toastContext";
import { Avatar, Spinner } from "./ui";
import { ChatListPane, totalUnread } from "./ChatListPane";
import { ChatView } from "./ChatView";
import { SettingsPane } from "./SettingsPane";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { AuthScreens, JoinScreen } from "./AuthScreens";
import { ContactsPane } from "./ContactsPane";
import { MiniPlayer, MusicProvider } from "./MusicPlayer";
import { NewChatSheet } from "./NewChatSheet";
import { groupStories, StoryCreator, StoryViewer } from "./Stories";
import { useAccounts, useContactNames, useFolders, useMyAccount, useMyChats, useStories, useUserChats } from "./hooks";

type Tab = "contacts" | "chats" | "settings";

export function MessengerApp() {
  const router = useRouter();
  const sp = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const me = user?.uid ?? null;
  const { account, loading: accLoading, error: accError } = useMyAccount(me);
  const { chats, loading: chatsLoading } = useMyChats(account && !account.banned ? me : null);
  const userChats = useUserChats(account && !account.banned ? me : null);
  const folders = useFolders(account && !account.banned ? me : null);
  const { stories, reload: reloadStories } = useStories(!!account && !account.banned);
  useContactNames(!!account && !account.banned);

  const [tab, setTab] = useState<Tab>("chats");
  const [newChat, setNewChat] = useState(false);
  const [storyUid, setStoryUid] = useState<string | null>(null);
  const [creator, setCreator] = useState(false);
  const [settingsPage, setSettingsPage] = useState<"notifications" | undefined>(undefined);
  const [pushHint, setPushHint] = useState(false);
  const openedFromList = useRef(false);
  const { toast } = useToast();
  const joinHandled = useRef<string | null>(null);

  const chatId = sp.get("chat");
  const activeChat = chatId ? chats.find((c) => c.id === chatId) ?? null : null;

  // --- присутствие: «в сети» (нужна поддержка на сервере — см. NOTES-B.md) ---
  useEffect(() => {
    if (!account || account.banned) return;
    const ping = () => document.visibilityState === "visible" && mApi("presence", {}).catch(() => {});
    ping();
    const t = setInterval(ping, 60_000);
    document.addEventListener("visibilitychange", ping);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", ping);
    };
  }, [account]);

  // ссылки-приглашения: /m?join=@канал или /m?join=<код>
  const joinParam = sp.get("join");
  useEffect(() => {
    if (!joinParam || !account || account.banned || joinHandled.current === joinParam) return;
    joinHandled.current = joinParam;
    const body = joinParam.startsWith("@") ? { handle: joinParam.slice(1) } : { inviteCode: joinParam };
    mApi<{ chatId?: string; id?: string; pending?: boolean }>("join-chat", body)
      .then((res) => {
        const id = res.chatId ?? res.id;
        if (res.pending) toast("info", "Заявка отправлена — админ должен её одобрить");
        if (id) router.replace(`/m?chat=${encodeURIComponent(id)}`, { scroll: false });
        else router.replace("/m", { scroll: false });
      })
      .catch((err) => {
        toast("error", err instanceof MApiError ? err.message : "Не удалось вступить по ссылке");
        router.replace("/m", { scroll: false });
      });
  }, [joinParam, account, router, toast]);

  const unread = totalUnread(chats, userChats);

  // --- бейдж на иконке PWA и в заголовке вкладки ---
  useEffect(() => {
    document.title = unread > 0 ? `(${unread}) Velox Chat` : "Velox Chat";
    const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
    if (unread > 0) nav.setAppBadge?.(unread).catch(() => {});
    else nav.clearAppBadge?.().catch(() => {});
  }, [unread]);

  // --- подсказка про уведомления ---
  useEffect(() => {
    try {
      if (isPushSupported() && Notification.permission === "default" && !localStorage.getItem("mx-push-hint-dismissed")) setPushHint(true);
    } catch {}
  }, []);

  const openChat = useCallback(
    (id: string) => {
      openedFromList.current = true;
      router.push(`/m?chat=${encodeURIComponent(id)}`, { scroll: false });
    },
    [router]
  );
  const closeChat = useCallback(() => {
    if (openedFromList.current) {
      openedFromList.current = false;
      router.back();
    } else router.replace("/m");
  }, [router]);

  const groups = useMemo(() => (me ? groupStories(stories, me) : []), [stories, me]);
  const storyAccounts = useAccounts(groups.map((g) => g.uid));

  if (authLoading || (user && accLoading)) {
    return <div className="h-full flex items-center justify-center"><Spinner size={30} /></div>;
  }
  // не вошёл → приветствие/вход/регистрация; вошёл на сайте, но без аккаунта MiliGram → выбор @username
  if (!user) return <AuthScreens />;
  if (accError) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center px-8 gap-3">
        <p className="text-[20px] font-bold">Не удаётся загрузить аккаунт MiliGram</p>
        <p className="mx-muted max-w-sm text-sm">
          Код ошибки: {accError}. {accError === "permission-denied" ? "Похоже, в Firestore не задеплоены правила для мессенджера (messengerAccounts). Сообщи администратору." : "Проверь интернет и попробуй ещё раз."}
        </p>
        <button className="btn-primary px-5 py-2.5 text-sm" onClick={() => window.location.reload()}>Обновить</button>
        <button className="text-xs text-white/40" onClick={() => { signOut(auth).catch(() => {}); }}>Выйти из аккаунта</button>
      </div>
    );
  }
  if (!account || !me) return <JoinScreen defaultName={user.displayName ?? ""} onLogout={() => { signOut(auth).catch(() => {}); }} />;

  if (account.banned) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center px-8 gap-3">
        <p className="text-[22px] font-bold">Аккаунт заблокирован</p>
        <p className="mx-muted max-w-sm">Доступ к мессенджеру для этого аккаунта закрыт администрацией.</p>
      </div>
    );
  }

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "contacts", label: "Контакты", icon: <Users size={24} /> },
    { id: "chats", label: "Чаты", icon: <MessageCircle size={24} /> },
    { id: "settings", label: "Настройки", icon: <Settings size={24} /> },
  ];

  return (
    <MusicProvider>
      <AppLockGate uid={me} />
      <NotificationGate uid={me} />
    <div className="h-full flex">
      {/* ---- левая панель ---- */}
      <aside className={`${chatId ? "max-[899px]:hidden" : ""} relative w-full min-[900px]:w-[390px] min-[900px]:shrink-0 h-full flex flex-col`} style={{ borderRight: "1px solid var(--mx-line)" }}>
        {pushHint && tab === "chats" && (
          <div className="absolute z-30 left-3 right-3 mx-glass rounded-2xl px-3 py-2.5 flex items-center gap-3 mx-pop" style={{ top: "calc(env(safe-area-inset-top) + 56px)" }}>
            <Bell size={20} style={{ color: "var(--mx-accent)" }} />
            <button className="flex-1 text-left text-[14px]" onClick={() => { setSettingsPage("notifications"); setTab("settings"); setPushHint(false); }}>
              Включи уведомления, чтобы не пропускать сообщения
            </button>
            <button onClick={() => { setPushHint(false); try { localStorage.setItem("mx-push-hint-dismissed", "1"); } catch {} }} className="mx-muted p-1" aria-label="Закрыть"><X size={17} /></button>
          </div>
        )}

        <div className="flex-1 min-h-0">
          {tab === "chats" && (
            <ChatListPane
              me={me}
              myAccount={account}
              chats={chats}
              userChats={userChats}
              folders={folders}
              loading={chatsLoading}
              activeId={chatId}
              storyGroups={groups}
              storyAccounts={storyAccounts}
              onOpenChat={openChat}
              onNewChat={() => setNewChat(true)}
              onOpenStory={setStoryUid}
              onCreateStory={() => setCreator(true)}
            />
          )}
          {tab === "contacts" && <ContactsPane me={me} chats={chats} onOpenChat={(id) => { setTab("chats"); openChat(id); }} onNewChat={() => setNewChat(true)} />}
          {tab === "settings" && <SettingsPane key={settingsPage ?? "root"} me={me} account={account} folders={folders} initialPage={settingsPage} onLoggedOut={() => router.replace("/m")} />}
        </div>

        {/* нижняя плавающая стеклянная панель */}
        <nav className="mx-nav mx-liquid absolute left-4 right-4 z-20 mx-glass rounded-[28px] flex p-1.5" style={{ bottom: "calc(env(safe-area-inset-bottom) + 10px)", ["--i" as string]: Math.max(0, tabs.findIndex((t) => t.id === tab)) }}>
          <span className="mx-liquid-pill" aria-hidden />
          {tabs.map((t) => {
            const on = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => { setTab(t.id); if (t.id !== "settings") setSettingsPage(undefined); }}
                className="flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-[22px] text-[11px] font-medium relative"
                style={{ color: on ? "var(--mx-accent)" : "var(--mx-muted)", background: "transparent" }}
              >
                {t.id === "settings" ? (
                  <span className="w-6 h-6 inline-flex"><Avatar src={account.photoURL} name={account.displayName} seed={me} size={24} /></span>
                ) : (
                  t.icon
                )}
                {t.label}
                {t.id === "chats" && unread > 0 && <span className="mx-badge absolute top-0 right-[22%]" style={{ minWidth: 18, height: 18, fontSize: 11 }}>{unread > 99 ? "99+" : unread}</span>}
              </button>
            );
          })}
        </nav>
        <MiniPlayer bottom="calc(env(safe-area-inset-bottom) + 64px)" />
      </aside>

      {/* ---- правая панель: чат ---- */}
      <main className={`${chatId ? "" : "max-[899px]:hidden"} flex-1 min-w-0 h-full`}>
        {activeChat ? (
          <ChatView key={activeChat.id} chat={activeChat} me={me} myAccount={account} userChat={userChats[activeChat.id]} allChats={chats} onBack={closeChat} onOpenChat={openChat} />
        ) : chatId ? (
          <div className="h-full flex flex-col items-center justify-center gap-3 mx-muted">
            {chatsLoading ? <Spinner /> : <><MessagesSquare size={40} /><p>Чат не найден или у вас нет доступа</p><button className="mx-btn" style={{ width: "auto", padding: "10px 22px" }} onClick={closeChat}>К чатам</button></>}
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center gap-3 mx-muted max-[899px]:hidden">
            <MessagesSquare size={44} />
            <p className="text-[15px]">Выбери чат, чтобы начать общение</p>
          </div>
        )}
      </main>

      <NewChatSheet open={newChat} onClose={() => setNewChat(false)} me={me} myHandle={account.handle} onOpenChat={(id) => { setTab("chats"); openChat(id); }} />
      <StoryCreator open={creator} onClose={() => setCreator(false)} onCreated={reloadStories} />
      {storyUid && groups.length > 0 && (
        <StoryViewer groups={groups} startUid={storyUid} me={me} onClose={() => setStoryUid(null)} onChanged={reloadStories} onOpenChat={openChat} />
      )}
    </div>
    </MusicProvider>
  );
}
