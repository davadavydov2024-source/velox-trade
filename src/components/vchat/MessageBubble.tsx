"use client";

import { ReactNode, useEffect, useRef, useState } from "react";
import { Check, CheckCheck, Clock, Eye, FileText, Play, Share2, AlertCircle, Loader2 } from "lucide-react";
import { safeImageSrc } from "@/lib/safeImage";
import { Avatar } from "./ui";
import { VoicePlayer, VideoNoteView } from "./MediaPlayers";
import { MAccount, MChatType, MMessage, MPending } from "./mtypes";
import { formatDuration, formatTime, gradientFor, isVideoUrl } from "./util";

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

/** blob: (локальное превью) показываем как есть, остальное — через safeImageSrc. */
const imgSrc = (u: string) => (u.startsWith("blob:") ? u : safeImageSrc(u));

/** Картинка, которая меняет адрес без мигания: новый src сначала загружается в фоне, потом подменяется. */
function SmoothImg({ src, className, style }: { src: string; className?: string; style?: React.CSSProperties }) {
  const [shown, setShown] = useState(src);
  useEffect(() => {
    if (src === shown) return;
    let alive = true;
    const img = new Image();
    img.onload = () => alive && setShown(src);
    img.onerror = () => alive && setShown(src);
    img.src = src;
    return () => {
      alive = false;
    };
  }, [src, shown]);
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={shown} alt="" className={className} style={style} loading="lazy" draggable={false} />;
}

/** Кольцо прогресса поверх загружаемого медиа. */
function UploadRing({ progress }: { progress?: number }) {
  const r = 18;
  const c = 2 * Math.PI * r;
  const p = Math.max(0.06, Math.min(1, progress ?? 0.06));
  return (
    <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
      <span className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: "rgba(0,0,0,0.45)" }}>
        <svg width="44" height="44" viewBox="0 0 44 44" className="animate-spin" style={{ animationDuration: "1.6s" }}>
          <circle cx="22" cy="22" r={r} fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth="3" />
          <circle cx="22" cy="22" r={r} fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - p)} transform="rotate(-90 22 22)" />
        </svg>
      </span>
    </span>
  );
}

function MediaGrid({ urls, w, h, onOpen, uploading, progress }: { urls: string[]; w?: number; h?: number; onOpen: (url: string) => void; uploading?: boolean; progress?: number }) {
  if (urls.length === 1) {
    const url = urls[0];
    const ratio = w && h ? w / h : 1;
    const width = Math.min(280, Math.round(Math.min(1, 360 * ratio / 280) * 280));
    const video = isVideoUrl(url);
    return (
      <button onClick={() => onOpen(url)} className="relative block rounded-[15px] overflow-hidden" style={{ width: Math.max(140, width), aspectRatio: String(Math.max(0.6, Math.min(1.8, ratio))), background: "var(--vc-surface2)" }}>
        {video ? (
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <video src={url} className="w-full h-full object-cover" muted playsInline preload="metadata" />
        ) : (
          <SmoothImg src={imgSrc(url)} className="w-full h-full object-cover" />
        )}
        {uploading && <UploadRing progress={progress} />}
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
    <div className="grid gap-[3px] rounded-[15px] overflow-hidden" style={{ gridTemplateColumns: "1fr 1fr", width: 260 }}>
      {shown.map((u, i) => (
        <button key={i} onClick={() => onOpen(u)} className="relative aspect-square" style={{ background: "var(--vc-surface2)" }}>
          <SmoothImg src={imgSrc(u)} className="w-full h-full object-cover" />
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

export function MessageRow({
  msg,
  pending,
  me,
  chatType,
  accounts,
  showAuthor,
  isLastInGroup,
  read,
  selecting,
  selected,
  highlight,
  onOpenMedia,
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
  showAuthor: boolean;
  isLastInGroup: boolean;
  read: boolean;
  selecting: boolean;
  selected: boolean;
  highlight: boolean;
  onOpenMedia: (url: string) => void;
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

  if (msg.kind === "system") {
    return (
      <div className="flex justify-center my-2" data-mid={msg.id}>
        <span className="text-[12.5px] px-3 py-1 rounded-full vc-glass vc-muted">{msg.text}</span>
      </div>
    );
  }

  const isNote = msg.kind === "videoNote";
  const isSticker = msg.kind === "sticker" && !!msg.mediaUrl;
  const isMedia = msg.kind === "image";
  const urls = msg.mediaUrls?.length ? msg.mediaUrls : msg.mediaUrl ? [msg.mediaUrl] : [];

  const touchStart = () => {
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
    <span className="vc-meta">
      {chatType === "channel" && typeof msg.views === "number" && (
        <span className="inline-flex items-center gap-0.5"><Eye size={13} />{msg.views}</span>
      )}
      {msg.editedAt && <span>изменено</span>}
      <span>{formatTime(msg.createdAt)}</span>
      {mine && (
        <span key={pending ? pending.status : read ? "read" : "sent"} className="vc-tick inline-flex">
          {pending ? (
            pending.status === "failed" ? <AlertCircle size={13} color="var(--vc-danger)" /> : pending.status === "sent" ? <Check size={15} /> : <Clock size={12} />
          ) : read ? (
            <CheckCheck size={15} />
          ) : (
            <Check size={15} />
          )}
        </span>
      )}
    </span>
  );

  let content: ReactNode;
  if (msg.deletedForAll) {
    content = <p className="italic opacity-70">Сообщение удалено</p>;
  } else if (msg.kind === "poll" && msg.poll) {
    const poll = msg.poll;
    const total = Math.max(1, poll.total || poll.options.reduce((s, o) => s + o.count, 0));
    content = (
      <>
        <p className="font-semibold mb-0.5">{poll.question}</p>
        <p className="text-[12px] opacity-70 mb-2">
          {poll.closed ? "Опрос завершён" : poll.quiz ? "Викторина" : poll.anonymous ? "Анонимный опрос" : "Публичный опрос"}
          {poll.multiple ? " · несколько ответов" : ""}
        </p>
        <div className="space-y-1.5" style={{ minWidth: 200 }}>
          {poll.options.map((o, i) => {
            const pct = Math.round((o.count / total) * 100);
            return (
              <div key={i} className="relative rounded-lg overflow-hidden px-2.5 py-1.5" style={{ background: "rgba(127,127,127,0.18)" }}>
                <span className="absolute inset-y-0 left-0" style={{ width: `${pct}%`, background: "rgba(127,127,127,0.28)" }} />
                <span className="relative flex items-center justify-between gap-3 text-[14px]"><span>{o.text}</span><span className="opacity-75 text-[12.5px]">{o.count > 0 ? `${pct}%` : ""}</span></span>
              </div>
            );
          })}
        </div>
        <p className="text-[12px] opacity-70 mt-2">Проголосовало: {poll.total}</p>
        {meta}
        <div className="clear-both" />
      </>
    );
  } else if (msg.kind === "sticker") {
    content = msg.mediaUrl ? (
      <div className="relative">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={safeImageSrc(msg.mediaUrl)} alt="" width={160} height={160} className="block" style={{ width: 160, height: 160, objectFit: "contain" }} draggable={false} />
        <span className="absolute bottom-1 right-1 text-[11px] px-2 py-0.5 rounded-full text-white" style={{ background: "rgba(0,0,0,0.45)" }}>{formatTime(msg.createdAt)}</span>
      </div>
    ) : (
      <>
        <span className="text-[34px] leading-none">🧩</span> <span className="opacity-80">Стикер</span>
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
          <span className="w-11 h-11 rounded-full flex items-center justify-center shrink-0" style={{ background: mine ? "var(--vc-out-text)" : "var(--vc-accent)", color: mine ? "var(--vc-out)" : "var(--vc-accent-text)" }}>
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
        <MediaGrid urls={urls} w={msg.width} h={msg.height} onOpen={onOpenMedia} uploading={pending?.status === "sending"} progress={pending?.progress} />
        {msg.text && (
          <p className="px-2 pt-1.5 pb-0.5 whitespace-pre-wrap">
            <Linkified text={msg.text} />
            {meta}
          </p>
        )}
        {!msg.text && (
          <span className="absolute bottom-2 right-2 px-2 py-0.5 rounded-full text-white" style={{ background: "rgba(0,0,0,0.5)" }}>
            <span className="vc-meta" style={{ float: "none", margin: 0, opacity: 1 }}>
              {formatTime(msg.createdAt)}
              {mine && (read ? <CheckCheck size={14} /> : <Check size={14} />)}
            </span>
          </span>
        )}
      </>
    );
  } else {
    content = (
      <>
        <span className="whitespace-pre-wrap">
          <Linkified text={msg.text ?? ""} />
        </span>
        {meta}
        <div className="clear-both" />
      </>
    );
  }

  const bubbleClass = `vc-bubble ${mine ? "out" : "in"} ${isLastInGroup ? "tail" : ""} ${isMedia && !msg.text ? "media" : ""} ${isMedia && msg.text ? "media" : ""} ${isNote || isSticker ? "round" : ""} ${selected ? "selected" : ""} ${highlight ? "vc-hl" : ""} ${pending && pending.status !== "failed" ? "sending" : ""}`;

  return (
    <div
      data-mid={msg.id}
      className={`flex items-end gap-2 px-3 ${mine ? "justify-end" : "justify-start"} ${showAuthor || isLastInGroup ? "" : ""}`}
      style={{ marginTop: 2, marginBottom: isLastInGroup ? 6 : 0 }}
      onContextMenu={(e) => {
        e.preventDefault();
        onMenu();
      }}
      onTouchStart={touchStart}
      onTouchMove={cancelHold}
      onTouchEnd={() => clearTimeout(timer.current)}
      onTouchCancel={() => clearTimeout(timer.current)}
    >
      {selecting && (
        <button onClick={onToggleSelect} className="w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 order-first" style={{ borderColor: selected ? "var(--vc-accent)" : "var(--vc-muted)", background: selected ? "var(--vc-accent)" : "transparent" }} aria-label="Выбрать">
          {selected && <Check size={14} color="var(--vc-accent-text)" />}
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
            <p className="text-[12.5px] mb-1 flex items-center gap-1 opacity-85" style={{ color: mine ? "inherit" : "var(--vc-accent)" }}>
              <Share2 size={12} /> Переслано от {msg.forwardedFrom.name}
            </p>
          )}
          {msg.replyTo && !msg.deletedForAll && (
            <div
              className="vc-quote"
              style={{ borderColor: mine ? "var(--vc-out-text)" : "var(--vc-accent)" }}
              onClick={(e) => {
                e.stopPropagation();
                onJumpTo(msg.replyTo!.msgId);
              }}
            >
              <p className="font-semibold">{accounts[msg.replyTo.from]?.displayName ?? (msg.replyTo.from === me ? "Вы" : "Сообщение")}</p>
              <p className="truncate max-w-[220px]">{msg.replyTo.preview}</p>
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
              <button key={emoji} className={`vc-reaction ${users.includes(me) ? "mine" : ""}`} onClick={() => onReact(emoji)}>
                <span>{emoji}</span>
                <span className="text-[12px]">{users.length}</span>
              </button>
            ))}
          </div>
        )}
        {pending?.status === "failed" && (
          <button onClick={pending.retry} className="text-[12px] mt-1" style={{ color: "var(--vc-danger)" }}>
            Не отправлено — нажми, чтобы повторить
          </button>
        )}
      </div>
    </div>
  );
}
