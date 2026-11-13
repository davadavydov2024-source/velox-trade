"use client";

import { ReactNode, memo, useEffect, useRef, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Check, CheckCheck, Clock, Eye, FileText, Play, Share2, AlertCircle, Loader2, CornerUpLeft, Copy } from "lucide-react";
import { safeImageSrc } from "@/lib/safeImage";
import { Avatar } from "./ui";
import { GiftMessageCard } from "./Gifts";
import { GiveawayCard } from "./Giveaway";
import { VoicePlayer, VideoNoteView } from "./MediaPlayers";
import { MAccount, MChatType, MMessage, MPending } from "./mtypes";
import { emojiOnlyCount, formatDuration, formatTime, gradientFor, isVideoUrl } from "./util";
import { StickerMedia } from "./StickerMedia";
import { mApi, MApiError } from "./api";
import { LinkPreviewCard } from "./LinkPreview";
import { useToast } from "@/lib/toastContext";

const URL_RE = /(https?:\/\/[^\s<]+[^\s<.,;:!?)"'])/g;

function Linkified({ text }: { text: string }) {
  const parts = text.split(URL_RE);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <a key={i} href={p} target="_blank" rel="noopener noreferrer nofollow" className="underline" onClick={(e) => e.stopPropagation()}>
            {p}
          </a>
        ) : (
          <span key={i}>{p}</span>
        )
      )}
    </>
  );
}

function MediaGrid({ urls, w, h, onOpen }: { urls: string[]; w?: number; h?: number; onOpen: (url: string) => void }) {
  if (urls.length === 1) {
    const url = urls[0];
    const ratio = w && h ? w / h : 1;
    const width = Math.min(280, Math.round(Math.min(1, 360 * ratio / 280) * 280));
    const video = isVideoUrl(url);
    return (
      <button onClick={() => onOpen(url)} className="relative block rounded-[15px] overflow-hidden" style={{ width: `min(${Math.max(140, width)}px, 72vw)`, maxWidth: "100%", aspectRatio: String(Math.max(0.6, Math.min(1.8, ratio))), background: "var(--mx-surface2)" }}>
        {video ? (
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <video src={url} className="w-full h-full object-cover" muted playsInline preload="metadata" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={safeImageSrc(url)} alt="" className="w-full h-full object-cover" loading="lazy" draggable={false} />
        )}
        {video && (
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="w-12 h-12 rounded-full flex items-center justify-center text-white" style={{ background: "rgba(0,0,0,0.5)" }}>
              <Play size={22} fill="currentColor" />
            </span>
          </span>
        )}
      </button>
    );
  }
  const shown = urls.slice(0, 4);
  return (
    <div className="grid gap-[3px] rounded-[15px] overflow-hidden" style={{ gridTemplateColumns: "1fr 1fr", width: "min(260px, 72vw)", maxWidth: "100%" }}>
      {shown.map((u, i) => (
        <button key={i} onClick={() => onOpen(u)} className="relative aspect-square" style={{ background: "var(--mx-surface2)" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={safeImageSrc(u)} alt="" className="w-full h-full object-cover" loading="lazy" draggable={false} />
          {i === 3 && urls.length > 4 && (
            <span className="absolute inset-0 flex items-center justify-center text-white text-xl font-semibold" style={{ background: "rgba(0,0,0,0.5)" }}>
              +{urls.length - 4}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

function PollView({ poll, msgId, chatId, me }: { poll: NonNullable<MMessage["poll"]>; msgId: string; chatId: string; me: string }) {
  const { toast } = useToast();
  const [picked, setPicked] = useState<number[]>([]);
  // свой голос: messages/{id}/votes/{uid} (если правила Firestore не пускают — просто не подсвечиваем)
  const [mine, setMine] = useState<number[]>([]);
  useEffect(() => {
    if (!chatId || !msgId) return;
    return onSnapshot(
      doc(db, "messengerChats", chatId, "messages", msgId, "votes", me),
      (snap) => setMine(Array.isArray(snap.data()?.options) ? (snap.data()!.options as number[]) : []),
      () => setMine([])
    );
  }, [chatId, msgId, me]);
  const [busy, setBusy] = useState(false);
  const total = Math.max(1, poll.total || poll.options.reduce((s, o) => s + o.count, 0));
  const canVote = !poll.closed && !!chatId;
  const vote = async (options: number[]) => {
    if (busy || options.length === 0) return;
    setBusy(true);
    try {
      const res = await mApi<{ correct?: boolean; explanation?: string }>("poll", { chatId, msgId, action: "vote", options });
      if (poll.quiz && typeof res?.correct === "boolean") toast(res.correct ? "success" : "info", res.correct ? "Верно!" : "Неверно" + (res.explanation ? `: ${res.explanation}` : ""));
      setPicked([]);
    } catch (err) {
      toast("error", err instanceof MApiError ? err.message : "Не удалось проголосовать");
    } finally {
      setBusy(false);
    }
  };
  const retract = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await mApi("poll", { chatId, msgId, action: "retract" });
    } catch (err) {
      toast("error", err instanceof MApiError ? err.message : "Не удалось отозвать голос");
    } finally {
      setBusy(false);
    }
  };
  const onPick = (i: number) => {
    if (!canVote || (poll.quiz && mine.length > 0)) return;
    if (poll.multiple) setPicked((p) => (p.includes(i) ? p.filter((x) => x !== i) : [...p, i]));
    else vote([i]);
  };
  return (
    <>
      <p className="font-semibold mb-0.5">{poll.question}</p>
      <p className="text-[12px] opacity-70 mb-2">
        {poll.closed ? "Опрос завершён" : poll.quiz ? "Викторина" : poll.anonymous ? "Анонимный опрос" : "Публичный опрос"}
        {poll.multiple ? " · несколько ответов" : ""}
      </p>
      <div className="space-y-1.5" style={{ minWidth: 200 }}>
        {poll.options.map((o, i) => {
          const pct = Math.round((o.count / total) * 100);
          const on = picked.includes(i) || (picked.length === 0 && mine.includes(i));
          return (
            <button
              key={i}
              type="button"
              disabled={!canVote || busy}
              onClick={(e) => { e.stopPropagation(); onPick(i); }}
              className="relative block w-full text-left rounded-lg overflow-hidden px-2.5 py-1.5"
              style={{ background: "rgba(127,127,127,0.18)", outline: on ? "2px solid currentColor" : "none", outlineOffset: -2, cursor: canVote ? "pointer" : "default" }}
            >
              <span className="absolute inset-y-0 left-0" style={{ width: `${pct}%`, background: "rgba(127,127,127,0.28)" }} />
              <span className="relative flex items-center justify-between gap-3 text-[14px]"><span>{o.text}</span><span className="opacity-75 text-[12.5px]">{o.count > 0 ? `${pct}%` : ""}</span></span>
            </button>
          );
        })}
      </div>
      {poll.multiple && canVote && picked.length > 0 && (
        <button type="button" disabled={busy} onClick={(e) => { e.stopPropagation(); vote(picked); }} className="w-full mt-2 h-9 rounded-lg text-[14px] font-semibold" style={{ background: "rgba(127,127,127,0.28)" }}>
          Проголосовать
        </button>
      )}
      <p className="text-[12px] opacity-70 mt-2">
        Проголосовало: {poll.total}
        {canVote && !poll.quiz && mine.length > 0 && (
          <button type="button" disabled={busy} onClick={(e) => { e.stopPropagation(); retract(); }} className="underline ml-2">Отозвать голос</button>
        )}
      </p>
    </>
  );
}

function MessageRowImpl({
  msg,
  pending,
  me,
  chatType,
  accounts,
  chatId,
  showAuthor,
  isLastInGroup,
  read,
  selecting,
  selected,
  highlight,
  onOpenMedia,
  onOpenStickerPack,
  onSwipeReply,
  onJumpTo,
  onReact,
  onMenu,
  onToggleSelect,
  onDoubleTap,
}: {
  msg: MMessage;
  pending?: MPending;
  me: string;
  chatType: MChatType;
  accounts: Record<string, MAccount | null | undefined>;
  chatId?: string;
  showAuthor: boolean;
  isLastInGroup: boolean;
  read: boolean;
  selecting: boolean;
  selected: boolean;
  highlight: boolean;
  onOpenMedia: (url: string) => void;
  onOpenStickerPack?: (slug: string) => void;
  /** свайп сообщения влево — ответить (как в Telegram) */
  onSwipeReply?: () => void;
  onJumpTo: (msgId: string) => void;
  onReact: (emoji: string) => void;
  onMenu: () => void;
  onToggleSelect: () => void;
  onDoubleTap: () => void;
}) {
  const mine = msg.from === me;
  const timer = useRef<any>(null);
  const lastTap = useRef(0);
  const moved = useRef(false);
  const author = accounts[msg.from];
  const rowRef = useRef<HTMLDivElement>(null);
  const sw = useRef({ x: 0, y: 0, dx: 0, axis: "" as "" | "h" | "v", fired: false });

  if (msg.kind === "system") {
    return (
      <div className="flex justify-center my-2" data-mid={msg.id}>
        <span className="text-[12.5px] px-3 py-1 rounded-full mx-glass mx-muted">{msg.text}</span>
      </div>
    );
  }

  if (msg.kind === "gift" && msg.gift) {
    return (
      <div data-mid={msg.id}>
        <GiftMessageCard giftId={msg.gift.giftId} text={msg.text} price={msg.gift.price} mine={mine} anonymous={msg.gift.anonymous} nft={msg.gift.nft} senderName={author?.displayName ?? "Собеседник"} toName={accounts[msg.gift.to]?.displayName ?? "собеседнику"} />
      </div>
    );
  }

  const emojiCount = msg.kind === "text" && !msg.deletedForAll ? emojiOnlyCount(msg.text) : 0;
  const isNote = msg.kind === "videoNote";
  const isSticker = msg.kind === "sticker" && !!msg.mediaUrl;
  const isMedia = msg.kind === "image";
  const urls = msg.mediaUrls?.length ? msg.mediaUrls : msg.mediaUrl ? [msg.mediaUrl] : [];

  const touchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    sw.current = { x: t.clientX, y: t.clientY, dx: 0, axis: "", fired: false };
    moved.current = false;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (!moved.current) {
        navigator.vibrate?.(8);
        onMenu();
      }
    }, 420);
  };
  const cancelHold = () => {
    moved.current = true;
    clearTimeout(timer.current);
  };
  const touchMove = (e: React.TouchEvent) => {
    const t = e.touches[0];
    const s = sw.current;
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    if (!s.axis) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return; // дрожание пальца не отменяет долгое нажатие
      s.axis = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
      cancelHold();
    }
    if (s.axis !== "h" || !onSwipeReply || selecting) return;
    const x = Math.max(-76, Math.min(0, dx * 0.8));
    s.dx = x;
    const el = rowRef.current;
    if (el) {
      el.style.transition = "none";
      el.style.transform = `translateX(${x}px)`;
      el.style.setProperty("--swp", String(Math.min(1, Math.abs(x) / 56)));
    }
    if (x <= -56 && !s.fired) { s.fired = true; navigator.vibrate?.(10); }
  };
  const touchEnd = () => {
    clearTimeout(timer.current);
    const s = sw.current;
    const el = rowRef.current;
    if (el && s.dx !== 0) {
      el.style.transition = "transform 0.2s cubic-bezier(0.2,0.8,0.2,1)";
      el.style.transform = "translateX(0)";
      el.style.setProperty("--swp", "0");
    }
    if (s.axis === "h" && s.dx <= -56 && onSwipeReply && !selecting) onSwipeReply();
    s.dx = 0;
  };

  const handleClick = () => {
    if (selecting) return onToggleSelect();
    const now = Date.now();
    if (now - lastTap.current < 300) {
      lastTap.current = 0;
      onDoubleTap();
    } else lastTap.current = now;
  };

  const reactions = Object.entries(msg.reactions ?? {}).filter(([, users]) => users.length > 0);
  const nameColor = gradientFor(msg.from)[0];

  const meta: ReactNode = (
    <span className="mx-meta">
      {chatType === "channel" && typeof msg.views === "number" && (
        <span className="inline-flex items-center gap-0.5"><Eye size={13} />{msg.views}</span>
      )}
      {(msg as { keptDeletedAt?: number }).keptDeletedAt && <span className="mx-deleted-mark">удалено {formatTime((msg as { keptDeletedAt?: number }).keptDeletedAt!)}</span>}
      {msg.editedAt && <span>изменено</span>}
      <span>{formatTime(msg.createdAt)}</span>
      {mine &&
        (pending ? (
          pending.status === "failed" ? <AlertCircle size={13} color="var(--mx-danger)" /> : <Clock size={12} className="mx-clock" />
        ) : read ? (
          <CheckCheck key="read" size={15} className="mx-tick" />
        ) : (
          <Check key="sent" size={15} className="mx-tick" />
        ))}
    </span>
  );

  let content: ReactNode;
  if (msg.deletedForAll) {
    content = <p className="italic opacity-70">Сообщение удалено</p>;
  } else if (msg.kind === "giveaway" && msg.giveaway) {
    content = (
      <>
        <GiveawayCard msg={msg} chatId={chatId ?? ""} me={me} />
        {meta}
        <div className="clear-both" />
      </>
    );
  } else if (msg.kind === "poll" && msg.poll) {
    content = (
      <>
        <PollView poll={msg.poll} msgId={msg.id} chatId={chatId ?? ""} me={me} />
        {meta}
        <div className="clear-both" />
      </>
    );
  } else if (msg.kind === "sticker") {
    content = msg.mediaUrl ? (
      <div className="relative mx-sticker-msg">
        <StickerMedia url={msg.mediaUrl ?? ""} size={176} loop onClick={() => { if (!selecting && msg.sticker?.pack) onOpenStickerPack?.(msg.sticker.pack); }} />
        <span className="absolute bottom-1 right-1 text-[11px] px-2 py-0.5 rounded-full text-white flex items-center gap-1" style={{ background: "rgba(0,0,0,0.45)" }}>{formatTime(msg.createdAt)}{mine && (read ? <CheckCheck size={12} /> : <Check size={12} />)}</span>
      </div>
    ) : (
      <>
        <span className="text-[34px] leading-none">🧩</span> <span className="opacity-80">Стикер</span>
        {meta}
        <div className="clear-both" />
      </>
    );
  } else if (pending && msg.kind === "image" && urls.length === 0) {
    content = (
      <>
        <div className="flex items-center justify-center rounded-[15px]" style={{ width: "min(220px, 72vw)", aspectRatio: "1", background: "var(--mx-surface2)" }}>
          <Loader2 size={26} className="animate-spin opacity-70" />
        </div>
        {msg.text && <p className="px-2 pt-1.5 pb-0.5 whitespace-pre-wrap">{msg.text}</p>}
        <span className="mx-meta" style={{ float: "right" }}>{formatTime(msg.createdAt)}<Clock size={12} className="mx-clock" /></span>
        <div className="clear-both" />
      </>
    );
  } else if (pending && msg.kind === "voice" && !msg.mediaUrl) {
    content = (
      <>
        <span className="flex items-center gap-2 py-1" style={{ minWidth: 150 }}>🎤 <span>Голосовое {msg.duration ? formatDuration(msg.duration) : ""}</span></span>
        {meta}
        <div className="clear-both" />
      </>
    );
  } else if (pending && isNote && !msg.mediaUrl) {
    content = (
      <>
        <span className="flex items-center gap-2 py-1" style={{ minWidth: 150 }}>⏺ <span>Видеокружок {msg.duration ? formatDuration(msg.duration) : ""}</span></span>
        {meta}
        <div className="clear-both" />
      </>
    );
  } else if (msg.kind === "voice" && msg.mediaUrl) {
    content = (
      <>
        <VoicePlayer url={msg.mediaUrl} duration={msg.duration} waveform={msg.waveform} mine={mine} />
        {meta}
        <div className="clear-both" />
      </>
    );
  } else if (isNote && msg.mediaUrl) {
    content = (
      <div className="relative">
        <VideoNoteView url={msg.mediaUrl} />
        <span className="absolute bottom-2 left-2 text-[11.5px] px-2 py-0.5 rounded-full text-white flex items-center gap-1" style={{ background: "rgba(0,0,0,0.5)" }}>
          {msg.duration ? formatDuration(msg.duration) : ""} {formatTime(msg.createdAt)}
          {mine && (read ? <CheckCheck size={13} /> : <Check size={13} />)}
        </span>
      </div>
    );
  } else if (msg.kind === "file" && msg.mediaUrl) {
    content = (
      <>
        <a href={msg.mediaUrl} target="_blank" rel="noopener noreferrer" download className="flex items-center gap-3 py-1" onClick={(e) => e.stopPropagation()}>
          <span className="w-11 h-11 rounded-full flex items-center justify-center shrink-0" style={{ background: mine ? "var(--mx-out-text)" : "var(--mx-accent)", color: mine ? "var(--mx-out)" : "var(--mx-accent-text)" }}>
            <FileText size={20} />
          </span>
          <span className="min-w-0">
            <span className="block truncate max-w-[200px] font-medium">{msg.text || "Файл"}</span>
            <span className="text-[12px] opacity-70">Скачать</span>
          </span>
        </a>
        {meta}
        <div className="clear-both" />
      </>
    );
  } else if (isMedia && urls.length > 0) {
    content = (
      <>
        <MediaGrid urls={urls} w={msg.width} h={msg.height} onOpen={onOpenMedia} />
        {msg.text && (
          <p className="px-2 pt-1.5 pb-0.5 whitespace-pre-wrap">
            <Linkified text={msg.text} />
            {meta}
          </p>
        )}
        {!msg.text && (
          <span className="absolute bottom-2 right-2 px-2 py-0.5 rounded-full text-white" style={{ background: "rgba(0,0,0,0.5)" }}>
            <span className="mx-meta" style={{ float: "none", margin: 0, opacity: 1 }}>
              {formatTime(msg.createdAt)}
              {mine && (read ? <CheckCheck size={14} /> : <Check size={14} />)}
            </span>
          </span>
        )}
      </>
    );
  } else if (emojiCount > 0 && msg.kind === "text" && !msg.replyTo && !msg.forwardedFrom) {
    content = (
      <div className="relative px-1" style={{ minWidth: 52 }}>
        <span className="block leading-[1.15] select-none" style={{ fontSize: emojiCount === 1 ? 64 : emojiCount === 2 ? 52 : 44 }}>{(msg.text ?? "").trim()}</span>
        <span className="absolute bottom-0 right-0 text-[11px] px-2 py-0.5 rounded-full text-white flex items-center gap-1" style={{ background: "rgba(0,0,0,0.4)" }}>{formatTime(msg.createdAt)}{mine && (read ? <CheckCheck size={12} /> : <Check size={12} />)}</span>
      </div>
    );
  } else if (msg.kind === "text" && /^🔑 Код входа\n\d{6}/.test(msg.text ?? "")) {
    const lines = (msg.text ?? "").split("\n");
    const code = lines[1];
    const rest = lines.slice(2).join("\n").trim();
    content = (
      <div style={{ minWidth: 230 }}>
        <p className="flex items-center gap-2 text-[13px] font-semibold" style={{ color: "var(--mx-accent)" }}>🔑 Код входа</p>
        <p className="my-2 text-[34px] font-bold tracking-[0.18em] tabular-nums select-all">{code}</p>
        <button
          onClick={() => { navigator.clipboard?.writeText(code).catch(() => {}); }}
          className="w-full h-10 rounded-xl text-[15px] font-semibold flex items-center justify-center gap-2 active:opacity-70"
          style={{ background: "var(--mx-accent)", color: "var(--mx-accent-text, #fff)" }}
        >
          <Copy size={16} /> Копировать код
        </button>
        <p className="whitespace-pre-wrap text-[12.5px] mx-muted mt-2.5">{rest}</p>
        {meta}
        <div className="clear-both" />
      </div>
    );
  } else {
    const firstUrl = !msg.deletedForAll ? (msg.text ?? "").match(URL_RE)?.[0] : undefined;
    content = (
      <>
        <span className="whitespace-pre-wrap">
          <Linkified text={msg.text ?? ""} />
        </span>
        {firstUrl && <LinkPreviewCard url={firstUrl} mine={mine} />}
        {meta}
        <div className="clear-both" />
      </>
    );
  }

  const bubbleClass = `mx-bubble ${mine ? "out" : "in"} ${isLastInGroup ? "tail" : ""} ${isMedia && !msg.text ? "media" : ""} ${isMedia && msg.text ? "media" : ""} ${isNote || isSticker || emojiCount > 0 && !msg.replyTo && !msg.forwardedFrom ? "round" : ""} ${selected ? "selected" : ""} ${highlight ? "mx-hl" : ""} ${pending?.status === "sending" ? "sending" : ""} ${pending?.status === "failed" ? "failed" : ""}`;

  return (
    <div
      data-mid={msg.id}
      ref={rowRef}
      className={`relative flex items-end gap-2 px-3 ${mine ? "justify-end" : "justify-start"} ${showAuthor || isLastInGroup ? "" : ""}`}
      style={{ marginTop: 2, marginBottom: isLastInGroup ? 6 : 0 }}
      onContextMenu={(e) => {
        e.preventDefault();
        onMenu();
      }}
      onTouchStart={touchStart}
      onTouchMove={touchMove}
      onTouchEnd={touchEnd}
      onTouchCancel={touchEnd}
    >
      {onSwipeReply && (
        <span className="absolute top-1/2 -translate-y-1/2 flex items-center justify-center w-8 h-8 rounded-full pointer-events-none" style={{ right: -44, opacity: "var(--swp, 0)" as any, background: "var(--mx-glass)", color: "var(--mx-accent)" }}>
          <CornerUpLeft size={17} />
        </span>
      )}
      {selecting && (
        <button onClick={onToggleSelect} className="w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 order-first" style={{ borderColor: selected ? "var(--mx-accent)" : "var(--mx-muted)", background: selected ? "var(--mx-accent)" : "transparent" }} aria-label="Выбрать">
          {selected && <Check size={14} color="var(--mx-accent-text)" />}
        </button>
      )}
      {!mine && chatType !== "dm" && (
        <div style={{ width: 32 }} className="shrink-0">
          {isLastInGroup && <Avatar src={author?.photoURL} name={author?.displayName ?? "?"} seed={msg.from} size={32} />}
        </div>
      )}
      <div className="flex flex-col min-w-0" style={{ alignItems: mine ? "flex-end" : "flex-start", maxWidth: "100%" }}>
        <div className={bubbleClass} onClick={handleClick}>
          {!mine && chatType !== "dm" && showAuthor && !isNote && !isSticker && (
            <p className="text-[13px] font-semibold mb-0.5" style={{ color: nameColor }}>
              {author?.displayName ?? "Участник"}
            </p>
          )}
          {msg.forwardedFrom && !msg.deletedForAll && (
            <p className="text-[12.5px] mb-1 flex items-center gap-1 opacity-85" style={{ color: mine ? "inherit" : "var(--mx-accent)" }}>
              <Share2 size={12} /> Переслано от {msg.forwardedFrom.name}
            </p>
          )}
          {msg.replyTo && !msg.deletedForAll && (
            <div
              className="mx-quote"
              style={{ borderColor: mine ? "var(--mx-out-text)" : "var(--mx-accent)" }}
              onClick={(e) => {
                e.stopPropagation();
                onJumpTo(msg.replyTo!.msgId);
              }}
            >
              <div className="flex items-center gap-2">
                {msg.replyTo.thumb && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={safeImageSrc(msg.replyTo.thumb)} alt="" className="w-9 h-9 rounded-md object-cover shrink-0" draggable={false} loading="lazy" />
                )}
                <div className="min-w-0">
                  <p className="font-semibold truncate max-w-[200px]">{accounts[msg.replyTo.from]?.displayName ?? (msg.replyTo.from === me ? "Вы" : "Сообщение")}</p>
                  <p className="truncate max-w-[200px] opacity-90">{msg.replyTo.preview}</p>
                </div>
              </div>
            </div>
          )}
          {content}
          {pending?.status === "sending" && pending.progress !== undefined && pending.progress < 1 && (
            <span className="absolute inset-x-3 bottom-1 h-[3px] rounded-full overflow-hidden" style={{ background: "rgba(127,127,127,0.3)" }}>
              <span className="block h-full" style={{ width: `${Math.round((pending.progress ?? 0) * 100)}%`, background: "currentColor" }} />
            </span>
          )}
          {pending?.status === "sending" && pending.progress === undefined && (isMedia || isNote || msg.kind === "voice") && (
            <Loader2 size={14} className="absolute left-2 bottom-2 animate-spin" />
          )}
        </div>
        {reactions.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {reactions.map(([emoji, users]) => (
              <button key={emoji} className={`mx-reaction ${users.includes(me) ? "mine" : ""}`} onClick={() => onReact(emoji)}>
                <span>{emoji}</span>
                <span className="text-[12px]">{users.length}</span>
              </button>
            ))}
          </div>
        )}
        {pending?.status === "failed" && (
          <button onClick={pending.retry} className="text-[12px] mt-1" style={{ color: "var(--mx-danger)" }}>
            Не отправлено — нажми, чтобы повторить
          </button>
        )}
      </div>
    </div>
  );
}


/**
 * Строка сообщения перерисовывается только когда изменились её данные (сообщение, статус, выделение, группировка).
 * Обработчики из сравнения исключены — ChatView передаёт стабильные обёртки над актуальными функциями (см. H в ChatView).
 * На телефоне это убирает лишние перерисовки сотен пузырей при печати, «в сети», таймере и новых сообщениях.
 */
export const MessageRow = memo(MessageRowImpl, (a, b) =>
  a.msg === b.msg && a.pending === b.pending && a.me === b.me && a.chatType === b.chatType && a.accounts === b.accounts &&
  a.showAuthor === b.showAuthor && a.isLastInGroup === b.isLastInGroup && a.read === b.read && a.selecting === b.selecting &&
  a.selected === b.selected && a.highlight === b.highlight && !!a.onSwipeReply === !!b.onSwipeReply
);
