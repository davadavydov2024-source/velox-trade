"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Send, ImagePlus, Loader2, X } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { useToast } from "@/lib/toastContext";
import { subscribeConversation, sendDirectMessage } from "@/lib/directMessages";
import { DirectMessage } from "@/types";
import { safeImageSrc } from "@/lib/safeImage";
import { uploadImage, ImageUploadError } from "@/lib/storage";
import { PhotoAnnotator } from "@/components/PhotoAnnotator";
import { getPublicProfileCached } from "@/lib/sellerCache";
import { isValidImageSrc } from "@/lib/safeImage";
import { markChatRead, peerReadAt, UNREAD_TRACKING_START } from "@/lib/chatRead";
import { MessageTicks, ReadLabel, UploadingPhotoBubble } from "@/components/ChatStatus";

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

function formatDateLabel(ts: number) {
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return "Сегодня";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Вчера";
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}

export function DmThread({
  conversationId,
  peerUid,
  peerName,
  peerPhoto,
}: {
  conversationId: string;
  peerUid: string;
  peerName: string;
  peerPhoto: string | null;
}) {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [text, setText] = useState("");
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [pendingPhoto, setPendingPhoto] = useState<File | null>(null);
  const [peerUsername, setPeerUsername] = useState<string | null>(null);
  const [peerOnline, setPeerOnline] = useState(false);
  const [peerBanner, setPeerBanner] = useState<string | null>(null);
  const [readBy, setReadBy] = useState<Record<string, number> | undefined>(undefined);
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  // Счётчик, который растёт, когда вкладка снова становится видимой — чтобы отметить прочитанным то,
  // что пришло, пока человек был в другой вкладке (в скрытой вкладке сообщение прочитанным не считаем).
  const [visibleTick, setVisibleTick] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    getPublicProfileCached(peerUid).then((p) => {
      if (cancelled || !p) return;
      setPeerUsername(p.username);
      setPeerOnline(p.isOnline);
      setPeerBanner(p.bannerURL ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [peerUid]);

  useEffect(() => {
    const unsub = subscribeConversation(conversationId, (conv) => {
      setMessages(conv?.messages ?? []);
      setReadBy(conv?.readBy);
    });
    return unsub;
  }, [conversationId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, uploadPreview]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") setVisibleTick((n) => n + 1);
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, []);

  // Отмечаем диалог прочитанным, пока он открыт и вкладка на виду — отсюда у собеседника «Прочитано»,
  // а у нас пропадает бейдж «непрочитано».
  useEffect(() => {
    if (!user || messages.length === 0 || document.visibilityState !== "visible") return;
    const lastOther = [...messages].reverse().find((m) => m.from !== user.uid);
    if (!lastOther || lastOther.createdAt <= UNREAD_TRACKING_START) return;
    if (lastOther.createdAt <= (readBy?.[user.uid] ?? 0)) return;
    markChatRead("directConversations", conversationId, user.uid, lastOther.createdAt);
  }, [messages, readBy, user, conversationId, visibleTick]);

  const peerRead = peerReadAt(readBy, [peerUid]);
  const lastMineIdx = user ? messages.map((m) => m.from === user.uid).lastIndexOf(true) : -1;

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const value = text.trim();
    if (!value || !user || !profile) return;
    setText("");
    try {
      await sendDirectMessage(user.uid, profile.displayName, profile.photoURL ?? null, peerUid, peerName, peerPhoto, value);
    } catch {
      toast("error", "Не удалось отправить сообщение");
      setText(value);
    }
  }

  async function handlePhotoPick(file: File | undefined) {
    if (!file || !user || !profile) return;
    setUploadingPhoto(true);
    const preview = URL.createObjectURL(file);
    setUploadPreview(preview);
    try {
      const url = await uploadImage(file, "dm-photos");
      await sendDirectMessage(user.uid, profile.displayName, profile.photoURL ?? null, peerUid, peerName, peerPhoto, "", url);
    } catch (err) {
      toast("error", err instanceof ImageUploadError ? err.message : "Не удалось отправить фото");
    } finally {
      setUploadingPhoto(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      // Небольшая пауза, чтобы настоящее сообщение успело прилететь по подписке и пузырь «отправка»
      // сменился им без мигания.
      setTimeout(() => {
        setUploadPreview(null);
        URL.revokeObjectURL(preview);
      }, 500);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <PhotoAnnotator
        file={pendingPhoto}
        sending={uploadingPhoto}
        onCancel={() => {
          setPendingPhoto(null);
          if (fileInputRef.current) fileInputRef.current.value = "";
        }}
        onSend={(f) => {
          setPendingPhoto(null);
          handlePhotoPick(f);
        }}
      />

      {lightbox && (
        <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
          <button className="absolute top-4 right-4 text-white/70 hover:text-white" onClick={() => setLightbox(null)}>
            <X size={26} />
          </button>
          <img src={safeImageSrc(lightbox)} alt="" className="max-w-full max-h-full rounded-lg object-contain" />
        </div>
      )}

      <Link
        href={peerUsername ? `/seller/${peerUsername}` : "#"}
        className={`relative flex items-center gap-3 mb-3 shrink-0 rounded-2xl overflow-hidden p-3 border border-white/[0.06] ${peerUsername ? "hover:border-accent/30" : "pointer-events-none"} transition-colors`}
      >
        {/* Фон шапки: баннер собеседника (если он админ с баннером) или мягкий градиент */}
        {isValidImageSrc(peerBanner) ? (
          <Image src={safeImageSrc(peerBanner)} alt="" fill className="object-cover" sizes="600px" />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-r from-accent/15 via-accent/5 to-transparent" />
        )}
        <div className="absolute inset-0 bg-gradient-to-r from-bg/85 via-bg/55 to-bg/20" />
        <div className="relative w-11 h-11 rounded-full bg-surface shrink-0 ring-2 ring-accent/40">
          <div className="absolute inset-0 rounded-full overflow-hidden">
            {peerPhoto && <Image src={safeImageSrc(peerPhoto)} alt="" fill className="object-cover" sizes="44px" />}
          </div>
          {peerOnline && <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-green-400 ring-2 ring-bg" />}
        </div>
        <div className="relative min-w-0">
          <p className="font-bold text-[15px] leading-tight truncate">{peerName}</p>
          <p className={`text-[11px] leading-tight ${peerOnline ? "text-green-400" : "text-white/35"}`}>{peerOnline ? "в сети" : peerUsername ? `@${peerUsername}` : "\u00A0"}</p>
        </div>
      </Link>

      <div ref={scrollRef} className="flex-1 min-h-0 space-y-1 overflow-y-auto mb-3 pr-1 -mr-1 overscroll-contain">
        {messages.length === 0 ? (
          <p className="text-sm text-white/30 text-center py-8">Сообщений пока нет. Напишите первым.</p>
        ) : (
          messages.map((m, i) => {
            const isMine = m.from === user?.uid;
            const prevSame = i > 0 && messages[i - 1].from === m.from;
            const showDateSeparator = i === 0 || new Date(messages[i - 1].createdAt).toDateString() !== new Date(m.createdAt).toDateString();
            return (
              <div key={i}>
                {showDateSeparator && (
                  <div className="flex items-center justify-center my-3">
                    <span className="text-[10px] font-medium text-white/30 bg-white/[0.04] px-2.5 py-1 rounded-full">{formatDateLabel(m.createdAt)}</span>
                  </div>
                )}
                <div className={`flex items-end gap-2 ${isMine ? "justify-end" : "justify-start"} ${prevSame && !showDateSeparator ? "mt-0.5" : "mt-2.5"}`}>
                <div
                  className={`max-w-[85%] sm:max-w-[75%] shadow-sm ${
                    isMine
                      ? "bg-gradient-to-br from-accent to-accent-dark text-black shadow-[0_6px_18px_-8px_var(--color-accent)]"
                      : "bg-white/[0.06] border border-white/[0.07] text-white/85 backdrop-blur-sm"
                  } ${m.imageUrl ? "p-1.5" : "px-3.5 py-2"} text-[14px] leading-snug rounded-[20px] ${isMine ? "rounded-br-md" : "rounded-bl-md"}`}
                >
                  {m.imageUrl && (
                    <button type="button" onClick={() => setLightbox(m.imageUrl!)} className="block">
                      <Image src={safeImageSrc(m.imageUrl)} alt="" width={220} height={220} className="rounded-xl object-cover max-h-[220px] w-auto max-w-full" />
                    </button>
                  )}
                  {m.text && <p className={m.imageUrl ? "px-1.5 pt-1.5" : ""}>{m.text}</p>}
                  <p className={`text-[9px] text-right ${m.imageUrl ? "px-1.5 pb-0.5" : "mt-0.5"} ${isMine ? "text-black/60" : "opacity-50"}`}>
                    {formatTime(m.createdAt)}
                    {isMine && <MessageTicks read={m.createdAt <= peerRead} />}
                  </p>
                </div>
                </div>
                {isMine && i === lastMineIdx && !uploadPreview && <ReadLabel read={m.createdAt <= peerRead} />}
              </div>
            );
          })
        )}
        {uploadPreview && <UploadingPhotoBubble src={uploadPreview} />}
      </div>

      <form
        onSubmit={handleSend}
        className="flex gap-1.5 items-center shrink-0 p-1.5 rounded-full bg-white/[0.04] border border-white/[0.08] focus-within:border-accent/50 focus-within:ring-2 focus-within:ring-accent/20 transition-all"
        style={{ marginBottom: "env(safe-area-inset-bottom)" }}
      >
        <input
          autoComplete="off"
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && setPendingPhoto(e.target.files[0])}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadingPhoto}
          title="Отправить фото"
          className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-white/50 hover:text-accent hover:bg-white/5 disabled:opacity-50 transition-colors"
        >
          {uploadingPhoto ? <Loader2 size={16} className="animate-spin" /> : <ImagePlus size={16} />}
        </button>
        <input
          autoComplete="off"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Написать сообщение..."
          className="input-field py-2 text-sm flex-1 rounded-full"
          style={{ background: "transparent", border: "none", boxShadow: "none" }}
        />
        <button
          disabled={!text.trim()}
          className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center bg-gradient-to-br from-accent to-accent-dark text-black shadow-[0_4px_14px_-4px_var(--color-accent)] disabled:opacity-30 disabled:shadow-none hover:scale-105 active:scale-95 transition-all"
          aria-label="Отправить"
        >
          <Send size={15} />
        </button>
      </form>
    </div>
  );
}
