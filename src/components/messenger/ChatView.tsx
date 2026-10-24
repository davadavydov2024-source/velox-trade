"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Archive, BellOff, ChevronDown, ChevronLeft, Copy, CornerUpLeft, Forward, Info, MoreVertical, Pencil, Pin, PinOff, Trash2, X, CheckSquare, Bell, LogOut,
} from "lucide-react";
import { useToast } from "@/lib/toastContext";
import { mApi, mUpload, MApiError } from "./api";
import { Avatar, MenuList, Sheet, VerifiedBadge, Spinner } from "./ui";
import { MessageRow } from "./MessageBubble";
import { Composer, ComposerReply } from "./Composer";
import { ImageViewer, ViewerItem } from "./ImageViewer";
import { ForwardSheet } from "./ForwardSheet";
import { ChatInfoSheet } from "./ChatInfoSheet";
import { useAccounts, useLiveAccount, useMessages, useNow, useTyping } from "./hooks";
import { MX_FEATURES } from "./features";
import { MAccount, MChat, MMessage, MPending, MUserChat } from "./mtypes";
import { chatPhoto, chatTitle, dayLabel, DOUBLE_TAP_REACTION, extFromMime, isChatMuted, isOnline, isSavedMessages, isVideoUrl, lastSeenText, peerUid, plural, previewText, QUICK_REACTIONS, sameDay, shortCount } from "./util";
import type { RecordedAudio, RecordedVideo } from "./Recorders";

const NEAR_BOTTOM = 140;

function readDims(file: File): Promise<{ width?: number; height?: number }> {
  return new Promise((resolve) => {
    if (file.type.startsWith("video/")) {
      const v = document.createElement("video");
      v.preload = "metadata";
      v.onloadedmetadata = () => {
        resolve({ width: v.videoWidth, height: v.videoHeight });
        URL.revokeObjectURL(v.src);
      };
      v.onerror = () => resolve({});
      v.src = URL.createObjectURL(file);
      return;
    }
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => resolve({});
    img.src = URL.createObjectURL(file);
  });
}

export function ChatView({
  chat,
  me,
  myAccount,
  userChat,
  allChats,
  onBack,
  onOpenChat,
}: {
  chat: MChat;
  me: string;
  myAccount: MAccount;
  userChat?: MUserChat;
  allChats: MChat[];
  onBack: () => void;
  onOpenChat: (id: string) => void;
}) {
  const { toast } = useToast();
  const now = useNow(15_000);
  const { messages: allMessages, loading, hasMore, loadMore } = useMessages(chat.id);
  // «Удалить у себя» в API нет — такие сообщения просто скрываем на этом устройстве
  const hiddenKey = `mx-hidden-${chat.id}`;
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    try {
      setHiddenIds(new Set(JSON.parse(localStorage.getItem(hiddenKey) ?? "[]")));
    } catch {
      setHiddenIds(new Set());
    }
  }, [hiddenKey]);
  const messages = useMemo(() => allMessages.filter((m) => !hiddenIds.has(m.id)), [allMessages, hiddenIds]);
  const typingUids = useTyping(chat.id, me);
  const accounts = useAccounts(Array.from(new Set([...chat.members, ...messages.map((m) => m.from)])));
  const peer = useLiveAccount(chat.type === "dm" && !isSavedMessages(chat, me) ? peerUid(chat, me) : null);
  const accountsAll = useMemo(() => ({ ...accounts, [me]: myAccount, ...(peer ? { [peer.uid]: peer } : {}) }), [accounts, me, myAccount, peer]);

  const [pending, setPending] = useState<MPending[]>([]);
  const [reply, setReply] = useState<ComposerReply | null>(null);
  const [editing, setEditing] = useState<{ msgId: string; text: string } | null>(null);
  const [menuMsg, setMenuMsg] = useState<MMessage | null>(null);
  const [deleteMsgs, setDeleteMsgs] = useState<MMessage[] | null>(null);
  const [selection, setSelection] = useState<Set<string> | null>(null);
  const [forwardIds, setForwardIds] = useState<string[] | null>(null);
  const [viewer, setViewer] = useState<{ items: ViewerItem[]; start: number } | null>(null);
  const [headerMenu, setHeaderMenu] = useState(false);
  const [muteMenu, setMuteMenu] = useState(false);
  const [info, setInfo] = useState(false);
  const [pinIndex, setPinIndex] = useState(0);
  const [highlightId, setHighlightId] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const [showDown, setShowDown] = useState(false);
  const [unreadNew, setUnreadNew] = useState(0);
  const prevCount = useRef(0);
  const initialized = useRef(false);
  const lastTypingSent = useRef(0);
  const prevHeight = useRef(0);

  const title = chatTitle(chat, me, accountsAll);
  const photo = chatPhoto(chat, me, accountsAll);
  const saved = isSavedMessages(chat, me);
  const isAdmin = chat.admins?.includes(me) || chat.createdBy === me;
  const canPost = chat.type !== "channel" || isAdmin;
  const muted = isChatMuted(userChat?.muted, userChat?.mutedUntil, now);

  // ---- статус под названием ----
  const typingNames = typingUids.map((uid) => accountsAll[uid]?.displayName?.split(" ")[0] ?? "кто-то");
  let status = "";
  if (typingNames.length > 0) status = chat.type === "dm" ? "печатает…" : `${typingNames.join(", ")} печатает…`;
  else if (saved) status = "заметки для себя";
  else if (chat.type === "dm") status = lastSeenText(peer, now);
  else if (chat.type === "group") status = `${chat.members.length} ${plural(chat.members.length, "участник", "участника", "участников")}`;
  else status = `${shortCount(chat.members.length)} ${plural(chat.members.length, "подписчик", "подписчика", "подписчиков")}`;
  const online = chat.type === "dm" && isOnline(peer, now);

  // ---- прокрутка как в Telegram ----
  const scrollToBottom = useCallback((smooth = true) => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }, []);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM;
    atBottom.current = near;
    setShowDown(!near);
    if (near) setUnreadNew(0);
    if (el.scrollTop < 80 && hasMore && !loading) {
      prevHeight.current = el.scrollHeight;
      loadMore();
    }
  };

  useEffect(() => {
    initialized.current = false;
    prevCount.current = 0;
    setUnreadNew(0);
    setSelection(null);
    setReply(null);
    setEditing(null);
    setPending([]);
    setPinIndex(0);
  }, [chat.id]);

  const total = messages.length + pending.length;
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (!initialized.current) {
      if (total > 0) {
        initialized.current = true;
        prevCount.current = total;
        scrollToBottom(false);
      }
      return;
    }
    // подгрузили более старые — сохраняем позицию
    if (prevHeight.current) {
      el.scrollTop = el.scrollHeight - prevHeight.current + el.scrollTop;
      prevHeight.current = 0;
      prevCount.current = total;
      return;
    }
    const added = total - prevCount.current;
    prevCount.current = total;
    if (added <= 0) return;
    const last = messages[messages.length - 1];
    if (atBottom.current || last?.from === me || pending.length > 0) scrollToBottom(true);
    else setUnreadNew((n) => n + added);
  }, [total, messages, pending.length, me, scrollToBottom]);

  // ---- «прочитано» ----
  const lastIncoming = [...messages].reverse().find((m) => m.from !== me);
  useEffect(() => {
    if (!lastIncoming || document.visibilityState !== "visible") return;
    const readAt = chat.readBy?.[me] ?? 0;
    if (readAt >= lastIncoming.createdAt && (userChat?.unread ?? 0) === 0) return;
    const t = setTimeout(() => mApi("read", { chatId: chat.id }).catch(() => {}), 400);
    return () => clearTimeout(t);
  }, [lastIncoming?.id, chat.id, me, userChat?.unread, chat.readBy, lastIncoming]);

  // ---- «печатает…» ----
  const sendTyping = () => {
    const t = Date.now();
    if (t - lastTypingSent.current < 3000) return;
    lastTypingSent.current = t;
    mApi("typing", { chatId: chat.id }).catch(() => {});
  };

  // ---- отправка ----
  const replyPayload = () => (reply ? { msgId: reply.msgId } : undefined);

  const send = useCallback(
    async (tempId: string, payload: Record<string, unknown>) => {
      try {
        const res = await mApi<{ id?: string }>("send", { chatId: chat.id, ...payload });
        // оставляем плашку «отправляется», пока настоящее сообщение не придёт из Firestore (или 1.2 с)
        setTimeout(() => setPending((p) => p.filter((x) => x.tempId !== tempId)), res?.id ? 1200 : 400);
      } catch (err) {
        const msg = err instanceof MApiError ? err.message : "Не удалось отправить сообщение";
        toast("error", msg);
        setPending((p) => p.map((x) => (x.tempId === tempId ? { ...x, status: "failed", retry: () => { setPending((q) => q.filter((y) => y.tempId !== tempId)); send(`r${Date.now()}`, payload); } } : x)));
      }
    },
    [chat.id, toast]
  );

  const addPending = (p: Omit<MPending, "tempId" | "chatId" | "createdAt" | "status">): string => {
    const tempId = `p${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
    setPending((list) => [...list, { ...p, tempId, chatId: chat.id, createdAt: Date.now(), status: "sending" }]);
    return tempId;
  };
  const patchPending = (tempId: string, patch: Partial<MPending>) => setPending((list) => list.map((x) => (x.tempId === tempId ? { ...x, ...patch } : x)));

  const sendText = (text: string) => {
    const payload = { kind: "text", text, replyTo: replyPayload() };
    const tempId = addPending({ kind: "text", text });
    setReply(null);
    send(tempId, payload);
  };

  const failUpload = (tempId: string, err: unknown) => {
    toast("error", err instanceof MApiError ? err.message : "Не удалось загрузить файл");
    patchPending(tempId, { status: "failed", retry: () => setPending((l) => l.filter((x) => x.tempId !== tempId)) });
  };

  const sendMedia = async (files: File[], caption: string) => {
    const valid = files.filter((f) => {
      const isVideo = f.type.startsWith("video/");
      if (isVideo && !MX_FEATURES.upload) {
        toast("info", "Видео пока отправлять нельзя — только фото");
        return false;
      }
      const limit = isVideo ? 25 : 15;
      if (f.size > limit * 1024 * 1024) {
        toast("error", `«${f.name}» слишком большой (максимум ${limit} МБ)`);
        return false;
      }
      return true;
    });
    if (valid.length === 0) return;
    const tempId = addPending({ kind: "image", text: caption, progress: 0 });
    const rep = replyPayload();
    setReply(null);
    try {
      const done = await Promise.all(
        valid.map(async (f, i) => {
          const [up, dims] = await Promise.all([
            mUpload(f, "image", { onProgress: (p) => patchPending(tempId, { progress: p * 0.95 }) }),
            readDims(f),
          ]);
          return { url: up.url, width: up.width ?? dims.width, height: up.height ?? dims.height, i };
        })
      );
      const urls = done.sort((a, b) => a.i - b.i).map((d) => d.url);
      send(tempId, {
        kind: "image",
        text: caption || undefined,
        ...(urls.length === 1 ? { mediaUrl: urls[0] } : { mediaUrls: urls, mediaUrl: urls[0] }),
        width: done[0].width,
        height: done[0].height,
        replyTo: rep,
      });
    } catch (err) {
      failUpload(tempId, err);
    }
  };

  const sendFile = async (file: File) => {
    if (file.size > 25 * 1024 * 1024) return toast("error", "Файл слишком большой (максимум 25 МБ)");
    const tempId = addPending({ kind: "file", text: file.name, progress: 0 });
    try {
      const up = await mUpload(file, "file", { fileName: file.name, onProgress: (p) => patchPending(tempId, { progress: p * 0.95 }) });
      send(tempId, { kind: "file", mediaUrl: up.url, text: file.name, replyTo: replyPayload() });
      setReply(null);
    } catch (err) {
      failUpload(tempId, err);
    }
  };

  const sendVoice = async (a: RecordedAudio) => {
    const tempId = addPending({ kind: "voice", duration: a.duration, waveform: a.waveform, progress: 0 });
    try {
      const up = await mUpload(a.blob, "voice", { duration: a.duration, fileName: `voice.${extFromMime(a.mime)}`, onProgress: (p) => patchPending(tempId, { progress: p * 0.95 }) });
      send(tempId, { kind: "voice", mediaUrl: up.url, duration: Math.round(a.duration), waveform: a.waveform.map((v) => Math.round(v * 100) / 100), replyTo: replyPayload() });
      setReply(null);
    } catch (err) {
      failUpload(tempId, err);
    }
  };

  const sendVideoNote = async (v: RecordedVideo) => {
    const tempId = addPending({ kind: "videoNote", duration: v.duration, progress: 0 });
    try {
      const up = await mUpload(v.blob, "videoNote", { duration: v.duration, fileName: `note.${extFromMime(v.mime)}`, onProgress: (p) => patchPending(tempId, { progress: p * 0.95 }) });
      send(tempId, { kind: "videoNote", mediaUrl: up.url, duration: Math.round(v.duration), replyTo: replyPayload() });
      setReply(null);
    } catch (err) {
      failUpload(tempId, err);
    }
  };

  const saveEdit = async (msgId: string, text: string) => {
    setEditing(null);
    try {
      await mApi("edit", { chatId: chat.id, msgId, text });
    } catch (err) {
      toast("error", err instanceof MApiError ? err.message : "Не удалось изменить сообщение");
    }
  };

  // ---- действия над сообщениями ----
  const react = async (msg: MMessage, emoji: string) => {
    try {
      await mApi("react", { chatId: chat.id, msgId: msg.id, emoji });
    } catch (err) {
      toast("error", err instanceof MApiError ? err.message : "Не удалось поставить реакцию");
    }
  };

  const pinned = (chat.pinnedMessageIds ?? []).filter(Boolean);
  const togglePin = async (msg: MMessage) => {
    try {
      await mApi("pin", { chatId: chat.id, msgId: msg.id, pinned: !pinned.includes(msg.id) });
    } catch (err) {
      toast("error", err instanceof MApiError ? err.message : "Не удалось закрепить");
    }
  };

  const doDelete = async (list: MMessage[], forAll: boolean) => {
    setDeleteMsgs(null);
    setSelection(null);
    if (!forAll) {
      const next = new Set(hiddenIds);
      list.forEach((m) => next.add(m.id));
      setHiddenIds(next);
      try {
        localStorage.setItem(hiddenKey, JSON.stringify(Array.from(next)));
      } catch {}
      return;
    }
    const results = await Promise.allSettled(list.map((m) => mApi("delete", { chatId: chat.id, msgId: m.id })));
    const bad = results.find((r) => r.status === "rejected") as PromiseRejectedResult | undefined;
    if (bad) toast("error", bad.reason instanceof MApiError ? bad.reason.message : "Не все сообщения удалось удалить");
  };

  const copyText = async (list: MMessage[]) => {
    const t = list.map((m) => m.text ?? "").filter(Boolean).join("\n");
    if (!t) return toast("info", "В этом сообщении нет текста");
    try {
      await navigator.clipboard.writeText(t);
      toast("success", "Скопировано");
    } catch {
      toast("error", "Не удалось скопировать");
    }
  };

  const startReply = (m: MMessage) => {
    setEditing(null);
    setReply({ msgId: m.id, from: m.from, name: m.from === me ? "Вы" : accountsAll[m.from]?.displayName ?? "Сообщение", preview: previewText(m.kind, m.text) || "Сообщение" });
  };

  const jumpTo = useCallback(
    (msgId: string) => {
      const el = scrollRef.current?.querySelector(`[data-mid="${CSS.escape(msgId)}"]`);
      if (el) {
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        setHighlightId(msgId);
        setTimeout(() => setHighlightId(null), 1400);
      } else if (hasMore) {
        loadMore();
        toast("info", "Загружаю историю…");
      } else toast("info", "Сообщение не найдено");
    },
    [hasMore, loadMore, toast]
  );

  const chatSetting = async (patch: Record<string, unknown>) => {
    try {
      await mApi("chat-settings", { chatId: chat.id, ...patch });
    } catch (err) {
      toast("error", err instanceof MApiError ? err.message : "Не удалось применить настройку");
    }
  };

  const leaveChat = async () => {
    if (!confirm(chat.type === "channel" ? "Отписаться от канала?" : "Покинуть группу?")) return;
    try {
      await mApi("chats/members", { chatId: chat.id, remove: [me] });
      onBack();
    } catch (err) {
      toast("error", err instanceof MApiError ? err.message : "Не удалось выйти");
    }
  };

  // ---- подготовка списка ----
  const mediaItems: ViewerItem[] = useMemo(() => {
    const out: ViewerItem[] = [];
    messages.forEach((m) => {
      if (m.kind !== "image" || m.deletedForAll) return;
      const urls = m.mediaUrls?.length ? m.mediaUrls : m.mediaUrl ? [m.mediaUrl] : [];
      urls.forEach((u) => out.push({ url: u, video: isVideoUrl(u) }));
    });
    return out;
  }, [messages]);

  const openMedia = (url: string) => {
    const idx = mediaItems.findIndex((i) => i.url === url);
    setViewer({ items: mediaItems, start: Math.max(0, idx) });
  };

  const isRead = (m: MMessage) => {
    if (saved) return true;
    const others = chat.members.filter((u) => u !== me);
    if (others.length === 0) return true;
    // в группах считаем прочитанным, когда прочитал хотя бы один; в личных — собеседник
    return chat.type === "dm" ? (chat.readBy?.[others[0]] ?? 0) >= m.createdAt : others.some((u) => (chat.readBy?.[u] ?? 0) >= m.createdAt);
  };

  const pendingAsMessages: { msg: MMessage; pending: MPending }[] = pending.map((p) => ({
    pending: p,
    msg: { id: p.tempId, from: me, kind: p.kind, text: p.text, mediaUrl: p.mediaUrl, duration: p.duration, waveform: p.waveform, createdAt: p.createdAt, reactions: {} },
  }));

  const rows: { msg: MMessage; pending?: MPending }[] = [...messages.map((m) => ({ msg: m })), ...pendingAsMessages];

  const selecting = selection !== null;
  const toggleSelect = (id: string) =>
    setSelection((s) => {
      const next = new Set(s ?? []);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next.size === 0 ? null : next;
    });

  const selectedMsgs = selecting ? messages.filter((m) => selection!.has(m.id)) : [];

  // ---- меню сообщения ----
  const menuItems = (m: MMessage) => {
    const mine = m.from === me;
    const isPinned = pinned.includes(m.id);
    return [
      { label: "Ответить", icon: <CornerUpLeft size={20} />, onPress: () => startReply(m), hidden: !canPost || !!m.deletedForAll },
      { label: "Копировать", icon: <Copy size={20} />, onPress: () => copyText([m]), hidden: !m.text },
      { label: "Изменить", icon: <Pencil size={20} />, onPress: () => { setReply(null); setEditing({ msgId: m.id, text: m.text ?? "" }); }, hidden: !mine || m.kind !== "text" || !!m.deletedForAll },
      { label: isPinned ? "Открепить" : "Закрепить", icon: isPinned ? <PinOff size={20} /> : <Pin size={20} />, onPress: () => togglePin(m), hidden: chat.type !== "dm" && !isAdmin },
      { label: "Переслать", icon: <Forward size={20} />, onPress: () => setForwardIds([m.id]), hidden: !!m.deletedForAll },
      { label: "Выбрать", icon: <CheckSquare size={20} />, onPress: () => setSelection(new Set([m.id])) },
      { label: "Удалить", icon: <Trash2 size={20} />, danger: true, onPress: () => setDeleteMsgs([m]) },
    ];
  };

  const currentPinId = pinned.length ? pinned[Math.min(pinIndex, pinned.length - 1)] : null;
  const pinnedMsg = currentPinId ? messages.find((m) => m.id === currentPinId) : null;

  const muteOptions = [
    { label: "На 1 час", ms: 3_600_000 },
    { label: "На 8 часов", ms: 8 * 3_600_000 },
    { label: "На 2 дня", ms: 2 * 86_400_000 },
    { label: "Навсегда", ms: 0 },
  ];

  return (
    <div className="flex flex-col h-full relative" style={{ background: "var(--mx-bg)" }}>
      {/* ---- шапка ---- */}
      <div className="mx-glass mx-safe-top shrink-0 z-10" style={{ borderWidth: "0 0 1px" }}>
        {selecting ? (
          <div className="h-14 flex items-center px-3 gap-2">
            <button onClick={() => setSelection(null)} className="p-2" aria-label="Отмена"><X size={22} /></button>
            <p className="font-semibold flex-1">{selection!.size} {plural(selection!.size, "сообщение", "сообщения", "сообщений")}</p>
            <button onClick={() => copyText(selectedMsgs)} className="p-2.5" aria-label="Копировать"><Copy size={21} /></button>
            <button onClick={() => setForwardIds(selectedMsgs.map((m) => m.id))} className="p-2.5" aria-label="Переслать"><Forward size={21} /></button>
            <button onClick={() => setDeleteMsgs(selectedMsgs)} className="p-2.5" style={{ color: "var(--mx-danger)" }} aria-label="Удалить"><Trash2 size={21} /></button>
          </div>
        ) : (
          <div className="h-14 flex items-center gap-1 px-1">
            <button onClick={onBack} className="min-[900px]:hidden flex items-center p-2" style={{ color: "var(--mx-accent)" }} aria-label="Назад">
              <ChevronLeft size={28} />
            </button>
            <button onClick={() => setInfo(true)} className="flex items-center gap-3 flex-1 min-w-0 text-left pl-1 min-[900px]:pl-3">
              <Avatar src={photo} name={title} seed={chat.type === "dm" ? peerUid(chat, me) : chat.id} size={40} online={online}>
                {saved ? "🔖" : undefined}
              </Avatar>
              <div className="min-w-0">
                <p className="font-semibold truncate flex items-center gap-1 text-[16px]">
                  {title}
                  {chat.type === "dm" && peer?.verified && <VerifiedBadge />}
                  {muted && <BellOff size={13} className="mx-muted shrink-0" />}
                </p>
                <p className="text-[13px] truncate" style={{ color: typingNames.length || online ? "var(--mx-accent)" : "var(--mx-muted)" }}>{status}</p>
              </div>
            </button>
            <button onClick={() => setHeaderMenu(true)} className="p-2.5 mx-muted" aria-label="Меню"><MoreVertical size={22} /></button>
          </div>
        )}
        {pinnedMsg || currentPinId ? (
          <button
            onClick={() => {
              jumpTo(currentPinId!);
              setPinIndex((i) => (i + 1) % pinned.length);
            }}
            className="w-full flex items-center gap-3 px-4 py-1.5 text-left"
            style={{ borderTop: "1px solid var(--mx-line)" }}
          >
            <div className="flex flex-col gap-[2px] self-stretch py-0.5">
              {pinned.slice(0, 4).map((id, i) => (
                <span key={id} className="w-[3px] flex-1 rounded-full" style={{ background: i === Math.min(pinIndex, pinned.length - 1) ? "var(--mx-accent)" : "var(--mx-line)" }} />
              ))}
            </div>
            <div className="min-w-0 flex-1 text-[13px]">
              <p className="font-semibold" style={{ color: "var(--mx-accent)" }}>Закреплённое сообщение{pinned.length > 1 ? ` #${Math.min(pinIndex, pinned.length - 1) + 1}` : ""}</p>
              <p className="truncate mx-muted">{pinnedMsg ? previewText(pinnedMsg.kind, pinnedMsg.text) || "Сообщение" : "Нажми, чтобы перейти"}</p>
            </div>
            <Pin size={16} className="mx-muted shrink-0" />
          </button>
        ) : null}
      </div>

      {/* ---- сообщения ---- */}
      <div ref={scrollRef} onScroll={onScroll} className="mx-scroll flex-1 min-h-0 py-2 relative">
        {hasMore && <div className="flex justify-center py-3"><Spinner size={18} /></div>}
        {loading && messages.length === 0 && <div className="flex justify-center py-10"><Spinner /></div>}
        {!loading && rows.length === 0 && (
          <div className="h-full flex items-center justify-center px-8 text-center mx-muted text-[14px]">
            {chat.type === "channel" ? "В канале пока нет публикаций." : "Сообщений пока нет. Напиши первым."}
          </div>
        )}
        {rows.map(({ msg, pending: pend }, i) => {
          const prev = rows[i - 1]?.msg;
          const next = rows[i + 1]?.msg;
          const newDay = !prev || !sameDay(prev.createdAt, msg.createdAt);
          const sameAsPrev = !!prev && prev.from === msg.from && !newDay && prev.kind !== "system" && msg.createdAt - prev.createdAt < 5 * 60_000;
          const sameAsNext = !!next && next.from === msg.from && sameDay(next.createdAt, msg.createdAt) && next.kind !== "system" && next.createdAt - msg.createdAt < 5 * 60_000;
          return (
            <div key={msg.id}>
              {newDay && (
                <div className="flex justify-center my-2.5">
                  <span className="text-[12.5px] px-3 py-1 rounded-full mx-glass font-medium">{dayLabel(msg.createdAt, now)}</span>
                </div>
              )}
              <MessageRow
                msg={msg}
                pending={pend}
                me={me}
                chatType={chat.type}
                accounts={accountsAll}
                showAuthor={!sameAsPrev}
                isLastInGroup={!sameAsNext}
                read={isRead(msg)}
                selecting={selecting}
                selected={!!selection?.has(msg.id)}
                highlight={highlightId === msg.id}
                onOpenMedia={openMedia}
                onJumpTo={jumpTo}
                onReact={(e) => react(msg, e)}
                onMenu={() => !pend && setMenuMsg(msg)}
                onToggleSelect={() => toggleSelect(msg.id)}
                onDoubleTap={() => !pend && !msg.deletedForAll && react(msg, DOUBLE_TAP_REACTION)}
              />
            </div>
          );
        })}
      </div>

      {showDown && (
        <button
          onClick={() => scrollToBottom(true)}
          className="absolute right-3 z-10 w-11 h-11 rounded-full flex items-center justify-center mx-glass mx-pop"
          style={{ bottom: 78 + (reply || editing ? 52 : 0) }}
          aria-label="Вниз"
        >
          <ChevronDown size={22} />
          {unreadNew > 0 && <span className="mx-badge absolute -top-2 -right-1">{unreadNew > 99 ? "99+" : unreadNew}</span>}
        </button>
      )}

      <Composer
        chatId={chat.id}
        disabledReason={!canPost ? "Только администраторы могут писать в канал" : undefined}
        reply={reply}
        editing={editing}
        onCancelReply={() => setReply(null)}
        onCancelEdit={() => setEditing(null)}
        onSendText={sendText}
        onSaveEdit={saveEdit}
        onSendMedia={sendMedia}
        onSendFile={sendFile}
        onSendVoice={sendVoice}
        onSendVideoNote={sendVideoNote}
        onTyping={sendTyping}
      />

      {/* ---- меню сообщения ---- */}
      <Sheet open={!!menuMsg} onClose={() => setMenuMsg(null)}>
        {menuMsg && (
          <>
            {!menuMsg.deletedForAll && (
              <div className="flex gap-1 px-4 pt-2 pb-3 overflow-x-auto mx-noscrollbar">
                {QUICK_REACTIONS.map((e) => (
                  <button key={e} onClick={() => { react(menuMsg, e); setMenuMsg(null); }} className="text-[28px] w-12 h-12 rounded-full shrink-0 flex items-center justify-center active:scale-90 transition-transform" style={{ background: menuMsg.reactions?.[e]?.includes(me) ? "var(--mx-surface2)" : "transparent" }}>
                    {e}
                  </button>
                ))}
              </div>
            )}
            <MenuList items={menuItems(menuMsg)} onDone={() => setMenuMsg(null)} />
          </>
        )}
      </Sheet>

      {/* ---- удаление ---- */}
      <Sheet open={!!deleteMsgs} onClose={() => setDeleteMsgs(null)} title={deleteMsgs && deleteMsgs.length > 1 ? `Удалить ${deleteMsgs.length} сообщ.?` : "Удалить сообщение?"}>
        {deleteMsgs && (
          <MenuList
            onDone={() => {}}
            items={[
              { label: "Удалить у всех", icon: <Trash2 size={20} />, danger: true, hidden: !(deleteMsgs.every((m) => m.from === me) || isAdmin), onPress: () => doDelete(deleteMsgs, true) },
              { label: "Скрыть у меня", icon: <Trash2 size={20} />, danger: true, onPress: () => doDelete(deleteMsgs, false) },
              { label: "Отмена", icon: <X size={20} />, onPress: () => setDeleteMsgs(null) },
            ]}
          />
        )}
      </Sheet>

      {/* ---- меню чата ---- */}
      <Sheet open={headerMenu} onClose={() => setHeaderMenu(false)}>
        <MenuList
          onDone={() => setHeaderMenu(false)}
          items={[
            { label: "Информация", icon: <Info size={20} />, onPress: () => setInfo(true) },
            { label: userChat?.pinned ? "Открепить чат" : "Закрепить чат", icon: userChat?.pinned ? <PinOff size={20} /> : <Pin size={20} />, onPress: () => chatSetting({ pinned: !userChat?.pinned }) },
            muted
              ? { label: "Включить звук", icon: <Bell size={20} />, onPress: () => chatSetting({ muted: false, mutedUntil: 0 }) }
              : { label: "Без звука", icon: <BellOff size={20} />, onPress: () => setMuteMenu(true) },
            { label: userChat?.archived ? "Вернуть из архива" : "В архив", icon: <Archive size={20} />, onPress: () => { chatSetting({ archived: !userChat?.archived }); if (!userChat?.archived) onBack(); } },
            { label: chat.type === "channel" ? "Отписаться" : "Покинуть группу", icon: <LogOut size={20} />, danger: true, hidden: chat.type === "dm", onPress: leaveChat },
          ]}
        />
      </Sheet>
      <Sheet open={muteMenu} onClose={() => setMuteMenu(false)} title="Отключить уведомления">
        <MenuList
          onDone={() => setMuteMenu(false)}
          items={muteOptions.map((o) => ({ label: o.label, icon: <BellOff size={20} />, onPress: () => chatSetting({ muted: true, mutedUntil: o.ms ? Date.now() + o.ms : 0 }) }))}
        />
      </Sheet>

      <ForwardSheet
        open={!!forwardIds}
        onClose={() => setForwardIds(null)}
        chats={allChats}
        me={me}
        currentChatId={chat.id}
        onForward={async (toChatIds) => {
          const ids = forwardIds!;
          setForwardIds(null);
          setSelection(null);
          try {
            await mApi("forward", { fromChatId: chat.id, msgIds: ids, toChatIds });
            toast("success", "Переслано");
            if (toChatIds.length === 1 && toChatIds[0] !== chat.id) onOpenChat(toChatIds[0]);
          } catch (err) {
            toast("error", err instanceof MApiError ? err.message : "Не удалось переслать");
          }
        }}
      />

      <ChatInfoSheet open={info} onClose={() => setInfo(false)} chat={chat} me={me} accounts={accountsAll} peer={peer} isAdmin={isAdmin} onLeave={leaveChat} />

      {viewer && <ImageViewer items={viewer.items} start={viewer.start} onClose={() => setViewer(null)} />}
    </div>
  );
}
