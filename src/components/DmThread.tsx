"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Send, ImagePlus, Loader2, X } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { useToast } from "@/lib/toastContext";
import { subscribeConversation, sendDirectMessage } from "@/lib/directMessages";
import { DirectMessage } from "@/types";
import { safeImageSrc } from "@/lib/safeImage";
import { uploadImage, ImageUploadError } from "@/lib/storage";

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsub = subscribeConversation(conversationId, (conv) => setMessages(conv?.messages ?? []));
    return unsub;
  }, [conversationId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const value = text.trim();
    if (!value || !user || !profile) return;
    setText("");
    try {
      await sendDirectMessage(user.uid, profile.displayName, profile.photoURL, peerUid, peerName, peerPhoto, value);
    } catch {
      toast("error", "Не удалось отправить сообщение");
      setText(value);
    }
  }

  async function handlePhotoPick(file: File | undefined) {
    if (!file || !user || !profile) return;
    setUploadingPhoto(true);
    try {
      const url = await uploadImage(file, "dm-photos");
      await sendDirectMessage(user.uid, profile.displayName, profile.photoURL, peerUid, peerName, peerPhoto, "", url);
    } catch (err) {
      toast("error", err instanceof ImageUploadError ? err.message : "Не удалось отправить фото");
    } finally {
      setUploadingPhoto(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col h-full">
      {lightbox && (
        <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
          <button className="absolute top-4 right-4 text-white/70 hover:text-white" onClick={() => setLightbox(null)}>
            <X size={26} />
          </button>
          <img src={safeImageSrc(lightbox)} alt="" className="max-w-full max-h-full rounded-lg object-contain" />
        </div>
      )}

      <div className="flex items-center gap-2.5 mb-3 shrink-0">
        <div className="relative w-9 h-9 rounded-full overflow-hidden bg-black/30 shrink-0">
          {peerPhoto && <Image src={safeImageSrc(peerPhoto)} alt="" fill className="object-cover" sizes="36px" />}
        </div>
        <p className="font-bold text-sm">{peerName}</p>
      </div>

      <div ref={scrollRef} className="flex-1 min-h-0 space-y-1 overflow-y-auto mb-3 pr-1 -mr-1 overscroll-contain">
        {messages.length === 0 ? (
          <p className="text-sm text-white/30 text-center py-8">Сообщений пока нет. Напишите первым.</p>
        ) : (
          messages.map((m, i) => {
            const isMine = m.from === user?.uid;
            const prevSame = i > 0 && messages[i - 1].from === m.from;
            return (
              <div key={i} className={`flex items-end gap-2 ${isMine ? "justify-end" : "justify-start"} ${prevSame ? "mt-0.5" : "mt-2.5"}`}>
                <div
                  className={`max-w-[85%] sm:max-w-[75%] shadow-sm ${
                    isMine ? "bg-gradient-to-br from-accent to-accent-dark text-black" : "bg-surface border border-white/[0.04] text-white/80"
                  } ${m.imageUrl ? "p-1.5" : "px-3.5 py-2.5"} text-[13.5px] leading-snug rounded-2xl ${isMine ? "rounded-br-md" : "rounded-bl-md"}`}
                >
                  {m.imageUrl && (
                    <button type="button" onClick={() => setLightbox(m.imageUrl!)} className="block">
                      <Image src={safeImageSrc(m.imageUrl)} alt="" width={220} height={220} className="rounded-xl object-cover max-h-[220px] w-auto max-w-full" />
                    </button>
                  )}
                  {m.text && <p className={m.imageUrl ? "px-1.5 pt-1.5" : ""}>{m.text}</p>}
                  <p className={`text-[9px] opacity-50 text-right ${m.imageUrl ? "px-1.5 pb-0.5" : "mt-0.5"}`}>{formatTime(m.createdAt)}</p>
                </div>
              </div>
            );
          })
        )}
      </div>

      <form onSubmit={handleSend} className="flex gap-2 items-end shrink-0" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <input autoComplete="off" ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handlePhotoPick(e.target.files?.[0])} />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadingPhoto}
          title="Отправить фото"
          className="btn-secondary px-3 py-2.5 shrink-0 disabled:opacity-50"
        >
          {uploadingPhoto ? <Loader2 size={16} className="animate-spin" /> : <ImagePlus size={16} />}
        </button>
        <input
          autoComplete="off"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Написать сообщение..."
          className="input-field py-2.5 text-sm flex-1 rounded-full"
        />
        <button className="btn-primary w-10 h-10 shrink-0 rounded-full flex items-center justify-center p-0">
          <Send size={16} />
        </button>
      </form>
    </div>
  );
}
