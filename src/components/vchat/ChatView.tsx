"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Archive, BellOff, ChevronDown, Search, ChevronLeft, Copy, CornerUpLeft, Forward, Info, MoreVertical, Pencil, Pin, PinOff, Trash2, X, CheckSquare, Bell, LogOut,
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
import { MAccount, MChat, MMessage, MPending, MUserChat } from "./mtypes";
import { formatTime, chatPhoto, chatTitle, dayLabel, DOUBLE_TAP_REACTION, extFromMime, isChatMuted, isOnline, isSavedMessages, isVideoUrl, lastSeenText, peerUid, plural, previewText, QUICK_REACTIONS, sameDay, shortCount } from "./util";
import type { RecordedAudio, RecordedVideo } from "./Recorders";
import { DEFAULT_PERMISSIONS } from "@/lib/messenger/types";

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
  hiddenAt = 0,
  onDeleteChat,
  onBack,
  onOpenChat,
}: {
  chat: MChat;
  me: string;
  myAccount: MAccount;
  userChat?: MUserChat;
  allChats: MChat[];
  /** время локального «удалить чат у меня»: сообщения старше не показываем */
  hiddenAt?: number;
  onDeleteChat: () => void;
  onBack: () => void;
  onOpenChat: (id: string) => void;
}) {
  const { toast } = useToast();
  const now = useNow(15_000);
  const { messages: allMessages, loading, hasMore, loadMore } = useMessages(chat.id);
  // сервер сам помечает «удалить у меня» (hiddenFor), автоудаление (expireAt) и «очистить историю» (clearedAt)
  const clearedAt = Math.max(userChat?.clearedAt ?? 0, hiddenAt);
  const messages = useMemo(
    () => allMessages.filter((m) => !m.hiddenFor?.includes(me) && !(m.expireAt && m.expireAt < now) && m.createdAt > clearedAt),
    [allMessages, me, now, clearedAt]
  );
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
  const [dividerId, setDividerId] = useState<string | null>(null);
  const dividerSet = useRef(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [searchRes, setSearchRes] = useState<MMessage[]>([]);
  const [searching, setSearching] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const [showDown, setShowDown] = useState(false);
  const [unreadNew, setUnreadNew] = useState(0);
  const prevCount = useRef(0);
  const initialized = useRef(false);
  const lastTypingSent = useRef(0);
  const keyMap = useRef(new Map<string, string>()); // id настоящего сообщения → key его плашки «отправляется»
  const seen = useRef(new Set<string>());
  const ready = useRef(false);
  const prevHeight = useRef(0);

  const title = chatTitle(chat, me, accountsAll);
  const photo = chatPhoto(chat, me, accountsAll);
  const saved = isSavedMessages(chat, me);
  const isAdmin = chat.admins?.includes(me) || chat.createdBy === me;
  const perms = { ...DEFAULT_PERMISSIONS, ...(chat.permissions ?? {}) };
  const restriction = chat.restricted?.[me];
  const restrictedNow = !!restriction && restriction.until > now && restriction.sendMessages === false;
  const blockedReason = chat.service
    ? "Это служебный чат — отвечать в нём нельзя"
    : chat.banned?.includes(me)
    ? "Вы заблокированы в этом чате"
    : chat.type === "channel" && !isAdmin
    ? "Только администраторы могут писать в канал"
    : chat.type === "group" && !isAdmin && !perms.sendMessages
    ? "В этой группе писать могут только администраторы"
    : restrictedNow
    ? `Вам ограничена отправка сообщений до ${new Date(restriction!.until).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`
    : undefined;
  const canPost = !blockedReason;
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

  // разделитель «Новые сообщения»: ставим один раз при открытии чата перед первым непрочитанным
  useEffect(() => {
    dividerSet.current = false;
    setDividerId(null);
  }, [chat.id]);
  useEffect(() => {
    if (dividerSet.current || messages.length === 0 || userChat === undefined) return;
    dividerSet.current = true;
    if ((userChat.unread ?? 0) <= 0) return;
    const readAt = chat.readBy?.[me] ?? 0;
    const first = messages.find((m) => m.from !== me && m.createdAt > readAt);
    if (first) setDividerId(first.id);
  }, [messages, userChat, chat.readBy, me]);

  // поиск по сообщениям чата (недавняя история)
  useEffect(() => {
    const q = searchQ.trim();
    if (!searchOpen || q.length < 2) {
      setSearchRes([]);
      return;
    }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const res = await mApi<{ messages?: MMessage[]; results?: MMessage[] }>(`search-messages?chatId=${encodeURIComponent(chat.id)}&q=${encodeURIComponent(q)}`);
        setSearchRes(res.messages ?? res.results ?? []);
      } catch {
        setSearchRes([]);
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [searchQ, searchOpen, chat.id]);

  useEffect(() => {
    initialized.current = false;
    prevCount.current = 0;
    setUnreadNew(0);
    setSelection(null);
    setReply(null);
    setEditing(null);
    dropPending(pending.map((x) => x.tempId));
    keyMap.current.clear();
    seen.current.clear();
    ready.current = false;
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

  const addPending = (p: Omit<MPending, "tempId" | "chatId" | "createdAt" | "status">): string => {
    const tempId = `p${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
    setPending((list) => [...list, { ...p, tempId, chatId: chat.id, createdAt: Date.now(), status: "sending" }]);
    return tempId;
  };
  const patchPending = (tempId: string, patch: Partial<MPending>) => setPending((list) => list.map((x) => (x.tempId === tempId ? { ...x, ...patch } : x)));
  /** Убирает плашки «отправляется» и освобождает локальные превью (blob:-ссылки). */
  const dropPending = (ids: string[]) =>
    setPending((list) => {
      list.filter((p) => ids.includes(p.tempId)).forEach((p) => [p.mediaUrl, ...(p.mediaUrls ?? [])].forEach((u) => u?.startsWith("blob:") && URL.revokeObjectURL(u)));
      return list.filter((p) => !ids.includes(p.tempId));
    });

  const send = useCallback(
    async (tempId: string, payload: Record<string, unknown>) => {
      try {
        const res = await mApi<{ id?: string }>("send", { chatId: chat.id, ...payload });
        // плашка остаётся на месте, пока настоящее сообщение не придёт из Firestore — потом оно занимает её место
        // (тот же key), поэтому ничего не мигает и не пропадает. Запасная очистка — через 15 с.
        patchPending(tempId, { status: "sent", serverId: res?.id });
        setTimeout(() => dropPending([tempId]), 15_000);
      } catch (err) {
        const msg = err instanceof MApiError ? err.message : "Не удалось отправить сообщение";
        toast("error", msg);
        setPending((p) => p.map((x) => (x.tempId === tempId ? { ...x, status: "failed", retry: () => { dropPending([tempId]); send(`r${Date.now()}`, payload); } } : x)));
      }
    },
    [chat.id, toast]
  );

  const sendText = (text: string, opts?: { silent?: boolean }) => {
    const payload = { kind: "text", text, replyTo: replyPayload(), ...(opts?.silent ? { silent: true } : {}) };
    const tempId = addPending({ kind: "text", text });
    setReply(null);
    send(tempId, payload);
  };

  const failUpload = (tempId: string, err: unknown) => {
    toast("error", err instanceof MApiError ? err.message : "Не удалось загрузить файл");
    patchPending(tempId, { status: "failed", retry: () => dropPending([tempId]) });
  };

  const sendMedia = async (files: File[], caption: string) => {
    const valid = files.filter((f) => {
      const isVideo = f.type.startsWith("video/");
      if (isVideo) {
        toast("info", "Видео можно отправить только видеокружком (кнопка микрофона → камера)");
        return false;
      }
      const limit = 15;
      if (f.size > limit * 1024 * 1024) {
        toast("error", `«${f.name}» слишком большой (максимум ${limit} МБ)`);
        return false;
      }
      return true;
    });
    if (valid.length === 0) return;
    // локальные превью: фото видно сразу, пока грузится (с размытием и кольцом прогресса)
    const previews = valid.map((f) => URL.createObjectURL(f));
    const dims0 = await readDims(valid[0]);
    const tempId = addPending({ kind: "image", text: caption, mediaUrls: previews, mediaUrl: previews[0], width: dims0.width, height: dims0.height, progress: 0 });
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
    const tempId = addPending({ kind: "voice", duration: a.duration, waveform: a.waveform, mediaUrl: URL.createObjectURL(a.blob), progress: 0 });
    try {
      const up = await mUpload(a.blob, "voice", { duration: a.duration, fileName: `voice.${extFromMime(a.mime)}`, onProgress: (p) => patchPending(tempId, { progress: p * 0.95 }) });
      send(tempId, { kind: "voice", mediaUrl: up.url, duration: Math.round(a.duration), waveform: a.waveform.map((v) => Math.round(v * 100) / 100), replyTo: replyPayload() });
      setReply(null);
    } catch (err) {
      failUpload(tempId, err);
    }
  };

  const sendVideoNote = async (v: RecordedVideo) => {
    const tempId = addPending({ kind: "videoNote", duration: v.duration, mediaUrl: URL.createObjectURL(v.blob), progress: 0 });
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
    const results = await Promise.allSettled(list.map((m) => mApi("delete", { chatId: chat.id, msgId: m.id, forAll })));
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

  // Сопоставляем «отправляется» с настоящими сообщениями: пузырь не пропадает и не мигает —
  // настоящее сообщение занимает его место (тот же key), статус меняется плавно.
  const matched = useMemo(() => {
    const map = new Map<string, string>(); // realId → tempId
    const used = new Set<string>();
    for (const p of pending) {
      if (p.status === "failed") continue;
      let m = p.serverId ? messages.find((x) => x.id === p.serverId) : undefined;
      if (!m) {
        m = messages.find(
          (x) =>
            !used.has(x.id) &&
            !keyMap.current.has(x.id) &&
            x.from === me &&
            x.kind === p.kind &&
            x.createdAt >= p.createdAt - 5000 &&
            ((p.kind !== "text" && p.kind !== "image") || (x.text ?? "") === (p.text ?? ""))
        );
      }
      if (m) {
        used.add(m.id);
        map.set(m.id, p.tempId);
      }
    }
    return map;
  }, [pending, messages, me]);

  useEffect(() => {
    if (matched.size === 0) return;
    matched.forEach((tempId, realId) => keyMap.current.set(realId, tempId));
    dropPending(Array.from(matched.values()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matched]);

  const matchedTemp = new Set(matched.values());
  const rows: { msg: MMessage; pending?: MPending; key: string }[] = [
    ...messages.map((m) => ({ msg: m, key: matched.get(m.id) ?? keyMap.current.get(m.id) ?? m.id })),
    ...pending
      .filter((p) => !matchedTemp.has(p.tempId))
      .map((p) => ({
        key: p.tempId,
        pending: p,
        msg: { id: p.tempId, from: me, kind: p.kind, text: p.text, mediaUrl: p.mediaUrl, mediaUrls: p.mediaUrls, width: p.width, height: p.height, duration: p.duration, waveform: p.waveform, createdAt: p.createdAt, reactions: {} } as MMessage,
      })),
  ];

  // анимация появления — только у сообщений, которых не было при открытии чата
  useEffect(() => {
    rows.forEach((r) => seen.current.add(r.key));
    if (!loading) ready.current = true;
  });

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
      { label: "Копировать", icon: <Copy size={20} />, onPress: () => copyText([m]), hidden: !m.text || !!chat.noForwards },
      { label: "Изменить", icon: <Pencil size={20} />, onPress: () => { setReply(null); setEditing({ msgId: m.id, text: m.text ?? "" }); }, hidden: !mine || m.kind !== "text" || !!m.deletedForAll },
      { label: isPinned ? "Открепить" : "Закрепить", icon: isPinned ? <PinOff size={20} /> : <Pin size={20} />, onPress: () => togglePin(m), hidden: chat.type !== "dm" && !isAdmin },
      { label: "Переслать", icon: <Forward size={20} />, onPress: () => setForwardIds([m.id]), hidden: !!m.deletedForAll || !!chat.noForwards },
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
    <div className="flex flex-col h-full relative" style={{ background: "var(--vc-bg)" }}>
      {/* ---- шапка ---- */}
      <div className="vc-glass vc-safe-top shrink-0 z-10" style={{ borderWidth: "0 0 1px" }}>
        {selecting ? (
          <div className="h-14 flex items-center px-3 gap-2">
            <button onClick={() => setSelection(null)} className="p-2" aria-label="Отмена"><X size={22} /></button>
            <p className="font-semibold flex-1">{selection!.size} {plural(selection!.size, "сообщение", "сообщения", "сообщений")}</p>
            <button onClick={() => copyText(selectedMsgs)} className="p-2.5" aria-label="Копировать"><Copy size={21} /></button>
            <button onClick={() => setForwardIds(selectedMsgs.map((m) => m.id))} className="p-2.5" aria-label="Переслать"><Forward size={21} /></button>
            <button onClick={() => setDeleteMsgs(selectedMsgs)} className="p-2.5" style={{ color: "var(--vc-danger)" }} aria-label="Удалить"><Trash2 size={21} /></button>
          </div>
        ) : (
          <div className="h-14 flex items-center gap-1 px-1">
            <button onClick={onBack} className="min-[900px]:hidden flex items-center p-2" style={{ color: "var(--vc-accent)" }} aria-label="Назад">
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
                  {muted && <BellOff size={13} className="vc-muted shrink-0" />}
                </p>
                <p className="text-[13px] truncate" style={{ color: typingNames.length || online ? "var(--vc-accent)" : "var(--vc-muted)" }}>{status}</p>
              </div>
            </button>
            <button onClick={() => setHeaderMenu(true)} className="p-2.5 vc-muted" aria-label="Меню"><MoreVertical size={22} /></button>
          </div>
        )}
        {pinnedMsg || currentPinId ? (
          <button
            onClick={() => {
              jumpTo(currentPinId!);
              setPinIndex((i) => (i + 1) % pinned.length);
            }}
            className="w-full flex items-center gap-3 px-4 py-1.5 text-left"
            style={{ borderTop: "1px solid var(--vc-line)" }}
          >
            <div className="flex flex-col gap-[2px] self-stretch py-0.5">
              {pinned.slice(0, 4).map((id, i) => (
                <span key={id} className="w-[3px] flex-1 rounded-full" style={{ background: i === Math.min(pinIndex, pinned.length - 1) ? "var(--vc-accent)" : "var(--vc-line)" }} />
              ))}
            </div>
            <div className="min-w-0 flex-1 text-[13px]">
              <p className="font-semibold" style={{ color: "var(--vc-accent)" }}>Закреплённое сообщение{pinned.length > 1 ? ` #${Math.min(pinIndex, pinned.length - 1) + 1}` : ""}</p>
              <p className="truncate vc-muted">{pinnedMsg ? previewText(pinnedMsg.kind, pinnedMsg.text) || "Сообщение" : "Нажми, чтобы перейти"}</p>
            </div>
            <Pin size={16} className="vc-muted shrink-0" />
          </button>
        ) : null}
      </div>

      {/* ---- сообщения ---- */}
      <div ref={scrollRef} onScroll={onScroll} className="vc-scroll vc-chat-bg flex-1 min-h-0 py-2 relative">
        {hasMore && <div className="flex justify-center py-3"><Spinner size={18} /></div>}
        {loading && messages.length === 0 && <div className="flex justify-center py-10"><Spinner /></div>}
        {!loading && rows.length === 0 && (
          <div className="h-full flex items-center justify-center px-8 text-center vc-muted text-[14px]">
            {chat.type === "channel" ? "В канале пока нет публикаций." : "Сообщений пока нет. Напиши первым."}
          </div>
        )}
        {rows.map(({ msg, pending: pend, key: rowKey }, i) => {
          const prev = rows[i - 1]?.msg;
          const next = rows[i + 1]?.msg;
          const newDay = !prev || !sameDay(prev.createdAt, msg.createdAt);
          const sameAsPrev = !!prev && prev.from === msg.from && !newDay && prev.kind !== "system" && msg.createdAt - prev.createdAt < 5 * 60_000;
          const sameAsNext = !!next && next.from === msg.from && sameDay(next.createdAt, msg.createdAt) && next.kind !== "system" && next.createdAt - msg.createdAt < 5 * 60_000;
          const isNew = ready.current && !seen.current.has(rowKey);
          return (
            <div key={rowKey} className={isNew ? `vc-msg-in ${msg.from === me ? "mine" : "theirs"}` : undefined}>
              {newDay && (
                <div className="flex justify-center my-2.5">
                  <span className="text-[12.5px] px-3 py-1 rounded-full vc-glass font-medium">{dayLabel(msg.createdAt, now)}</span>
                </div>
              )}
              {dividerId === msg.id && (
                <div className="flex items-center gap-3 px-4 my-2">
                  <span className="flex-1 h-px" style={{ background: "var(--vc-accent)", opacity: 0.4 }} />
                  <span className="text-[12.5px] font-medium px-3 py-1 rounded-full" style={{ background: "var(--vc-surface)", color: "var(--vc-accent)" }}>Новые сообщения</span>
                  <span className="flex-1 h-px" style={{ background: "var(--vc-accent)", opacity: 0.4 }} />
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
          className="absolute right-3 z-10 w-11 h-11 rounded-full flex items-center justify-center vc-glass vc-pop"
          style={{ bottom: 78 + (reply || editing ? 52 : 0) }}
          aria-label="Вниз"
        >
          <ChevronDown size={22} />
          {unreadNew > 0 && <span className="vc-badge absolute -top-2 -right-1">{unreadNew > 99 ? "99+" : unreadNew}</span>}
        </button>
      )}

      <Composer
        chatId={chat.id}
        disabledReason={blockedReason}
        reply={reply}
        editing={editing}
        onCancelReply={() => setReply(null)}
        onCancelEdit={() => setEditing(null)}
        onSendText={sendText}
        mentionables={chat.type === "group" ? (chat.members.filter((u) => u !== me).map((u) => accountsAll[u]).filter(Boolean) as MAccount[]) : []}
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
              <div className="flex gap-1 px-4 pt-2 pb-3 overflow-x-auto vc-noscrollbar">
                {QUICK_REACTIONS.map((e) => (
                  <button key={e} onClick={() => { react(menuMsg, e); setMenuMsg(null); }} className="text-[28px] w-12 h-12 rounded-full shrink-0 flex items-center justify-center active:scale-90 transition-transform" style={{ background: menuMsg.reactions?.[e]?.includes(me) ? "var(--vc-surface2)" : "transparent" }}>
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
              { label: "Удалить у меня", icon: <Trash2 size={20} />, danger: true, onPress: () => doDelete(deleteMsgs, false) },
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
            { label: "Поиск по сообщениям", icon: <Search size={20} />, onPress: () => { setSearchQ(""); setSearchOpen(true); } },
            { label: userChat?.pinned ? "Открепить чат" : "Закрепить чат", icon: userChat?.pinned ? <PinOff size={20} /> : <Pin size={20} />, onPress: () => chatSetting({ pinned: !userChat?.pinned }) },
            muted
              ? { label: "Включить звук", icon: <Bell size={20} />, onPress: () => chatSetting({ muted: false, mutedUntil: 0 }) }
              : { label: "Без звука", icon: <BellOff size={20} />, onPress: () => setMuteMenu(true) },
            { label: userChat?.archived ? "Вернуть из архива" : "В архив", icon: <Archive size={20} />, onPress: () => { chatSetting({ archived: !userChat?.archived }); if (!userChat?.archived) onBack(); } },
            { label: chat.type === "channel" ? "Отписаться" : "Покинуть группу", icon: <LogOut size={20} />, danger: true, hidden: chat.type === "dm", onPress: leaveChat },
            { label: "Удалить чат", icon: <Trash2 size={20} />, danger: true, onPress: onDeleteChat },
          ]}
        />
      </Sheet>
      <Sheet open={muteMenu} onClose={() => setMuteMenu(false)} title="Отключить уведомления">
        <MenuList
          onDone={() => setMuteMenu(false)}
          items={muteOptions.map((o) => ({ label: o.label, icon: <BellOff size={20} />, onPress: () => chatSetting({ muted: true, mutedUntil: o.ms ? Date.now() + o.ms : 0 }) }))}
        />
      </Sheet>

      <Sheet open={searchOpen} onClose={() => setSearchOpen(false)} title="Поиск в чате" full>
        <div className="px-4 pb-2">
          <div className="flex items-center gap-2 rounded-xl px-3 h-10" style={{ background: "var(--vc-surface2)" }}>
            <Search size={17} className="vc-muted" />
            <input value={searchQ} onChange={(e) => setSearchQ(e.target.value)} placeholder="Что искать?" className="bg-transparent outline-none flex-1 text-[16px]" autoFocus />
            {searching && <Spinner size={16} />}
          </div>
        </div>
        <div className="pb-8">
          {searchQ.trim().length >= 2 && !searching && searchRes.length === 0 && <p className="vc-muted text-center py-8">Ничего не найдено в недавней истории</p>}
          {searchRes.map((m) => (
            <button key={m.id} onClick={() => { setSearchOpen(false); setTimeout(() => jumpTo(m.id), 250); }} className="w-full text-left px-5 py-2.5 active:bg-white/5">
              <p className="text-[13px]" style={{ color: "var(--vc-accent)" }}>{accountsAll[m.from]?.displayName ?? "Участник"} · {dayLabel(m.createdAt, now)} {formatTime(m.createdAt)}</p>
              <p className="text-[15px] line-clamp-2">{previewText(m.kind, m.text)}</p>
            </button>
          ))}
        </div>
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
