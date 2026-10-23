"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Check, File as FileIcon, ImageIcon, Lock, Mic, Paperclip, Send, Smile, Video, X, Keyboard, Trash2 } from "lucide-react";
import { useToast } from "@/lib/toastContext";
import { EmojiPanel } from "./EmojiPanel";
import { MenuList, Sheet } from "./ui";
import { RecordedAudio, useVoiceRecorder, VideoNoteRecorder, RecordedVideo } from "./Recorders";
import { useMxPrefs } from "./prefs";
import { formatDuration } from "./util";

export interface ComposerReply {
  msgId: string;
  from: string;
  name: string;
  preview: string;
}

export function Composer({
  chatId,
  disabledReason,
  reply,
  editing,
  onCancelReply,
  onCancelEdit,
  onSendText,
  onSaveEdit,
  onSendMedia,
  onSendFile,
  onSendVoice,
  onSendVideoNote,
  onTyping,
}: {
  chatId: string;
  disabledReason?: string;
  reply: ComposerReply | null;
  editing: { msgId: string; text: string } | null;
  onCancelReply: () => void;
  onCancelEdit: () => void;
  onSendText: (text: string) => void;
  onSaveEdit: (msgId: string, text: string) => void;
  onSendMedia: (files: File[], caption: string) => void;
  onSendFile: (file: File) => void;
  onSendVoice: (a: RecordedAudio) => void;
  onSendVideoNote: (v: RecordedVideo) => void;
  onTyping: () => void;
}) {
  const { toast } = useToast();
  const enterToSend = useMxPrefs((s) => s.enterToSend);
  const [text, setText] = useState("");
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [mode, setMode] = useState<"voice" | "video">("voice");
  const [videoOpen, setVideoOpen] = useState(false);
  const [locked, setLocked] = useState(false);
  const [dragX, setDragX] = useState(0);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const mediaInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const voice = useVoiceRecorder();

  const draftKey = `mx-draft-${chatId}`;

  // черновик: подхватываем при открытии чата, сохраняем при наборе
  useEffect(() => {
    try {
      setText(localStorage.getItem(draftKey) ?? "");
    } catch {
      setText("");
    }
    setEmojiOpen(false);
  }, [draftKey]);

  useEffect(() => {
    if (editing) setText(editing.text);
  }, [editing]);

  useEffect(() => {
    if (editing) return;
    const t = setTimeout(() => {
      try {
        if (text) localStorage.setItem(draftKey, text);
        else localStorage.removeItem(draftKey);
      } catch {}
    }, 300);
    return () => clearTimeout(t);
  }, [text, draftKey, editing]);

  const autosize = useCallback(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, []);
  useEffect(autosize, [text, autosize]);

  const submit = () => {
    const value = text.trim();
    if (!value) return;
    if (editing) {
      onSaveEdit(editing.msgId, value);
      setText("");
      return;
    }
    onSendText(value);
    setText("");
    try {
      localStorage.removeItem(draftKey);
    } catch {}
    taRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const touch = typeof window !== "undefined" && "ontouchstart" in window;
    if (e.key === "Enter" && !e.shiftKey && enterToSend && !touch) {
      e.preventDefault();
      submit();
    }
  };

  const insertEmoji = (emoji: string) => {
    const el = taRef.current;
    if (!el) return setText((t) => t + emoji);
    const start = el.selectionStart ?? text.length;
    const end = el.selectionEnd ?? text.length;
    const next = text.slice(0, start) + emoji + text.slice(end);
    setText(next);
    requestAnimationFrame(() => {
      el.selectionStart = el.selectionEnd = start + emoji.length;
    });
  };

  const pickFiles = (list: FileList | null, kind: "media" | "file") => {
    const files = Array.from(list ?? []);
    if (files.length === 0) return;
    if (kind === "file") return onSendFile(files[0]);
    onSendMedia(files, text.trim());
    setText("");
  };

  const onPaste = (e: React.ClipboardEvent) => {
    const files = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith("image/"));
    if (files.length > 0) {
      e.preventDefault();
      onSendMedia(files, "");
    }
  };

  // ---- удержание микрофона ----
  const hold = useRef({ x: 0, y: 0, timer: 0 as any, started: false, cancelled: false, locked: false, starting: null as Promise<string | null> | null });

  const onMicDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const h = hold.current;
    h.x = e.clientX;
    h.y = e.clientY;
    h.started = false;
    h.cancelled = false;
    h.locked = false;
    setLocked(false);
    setDragX(0);
    if (mode === "video") return;
    h.timer = setTimeout(() => {
      h.starting = voice.start().then((err) => {
        if (err) toast("error", err);
        else h.started = true;
        return err;
      });
    }, 180);
  };

  const onMicMove = (e: React.PointerEvent) => {
    const h = hold.current;
    if (!h.started || h.locked) return;
    const dx = e.clientX - h.x;
    const dy = e.clientY - h.y;
    setDragX(Math.min(0, dx));
    if (dx < -90 && !h.cancelled) {
      h.cancelled = true;
      voice.cancel();
      h.started = false;
      navigator.vibrate?.(12);
    } else if (dy < -70) {
      h.locked = true;
      setLocked(true);
      navigator.vibrate?.(12);
    }
  };

  const onMicUp = async () => {
    const h = hold.current;
    clearTimeout(h.timer);
    setDragX(0);
    if (mode === "video") {
      setVideoOpen(true);
      return;
    }
    if (!h.starting) {
      // короткое нажатие — переключаем голос ⇄ видеокружок (как в Telegram)
      setMode("video");
      return;
    }
    await h.starting;
    h.starting = null;
    if (h.locked || h.cancelled || !h.started) return;
    h.started = false;
    const audio = await voice.stop();
    if (audio) onSendVoice(audio);
  };

  const sendLocked = async () => {
    hold.current.locked = false;
    hold.current.starting = null;
    setLocked(false);
    const audio = await voice.stop();
    if (audio) onSendVoice(audio);
  };
  const cancelLocked = () => {
    hold.current.locked = false;
    hold.current.starting = null;
    setLocked(false);
    voice.cancel();
  };

  if (disabledReason) {
    return (
      <div className="mx-safe-bottom shrink-0 mx-glass px-4 py-3.5 text-center mx-muted text-[14px]" style={{ borderWidth: "1px 0 0" }}>
        {disabledReason}
      </div>
    );
  }

  const hasText = text.trim().length > 0;
  const recordingUi = voice.recording;

  return (
    <div className="shrink-0 mx-safe-bottom" style={{ background: "var(--mx-bg)" }}>
      {(reply || editing) && (
        <div className="flex items-center gap-3 px-4 py-2 mx-fade" style={{ borderTop: "1px solid var(--mx-line)", background: "var(--mx-surface)" }}>
          <div className="w-[3px] self-stretch rounded-full" style={{ background: "var(--mx-accent)" }} />
          <div className="min-w-0 flex-1 text-[13.5px]">
            <p className="font-semibold" style={{ color: "var(--mx-accent)" }}>
              {editing ? "Редактирование" : `Ответ: ${reply!.name}`}
            </p>
            <p className="truncate mx-muted">{editing ? editing.text : reply!.preview}</p>
          </div>
          <button
            onClick={() => {
              if (editing) {
                onCancelEdit();
                setText("");
              } else onCancelReply();
            }}
            className="mx-muted p-1"
            aria-label="Отмена"
          >
            <X size={20} />
          </button>
        </div>
      )}

      <div className="flex items-end gap-2 px-2.5 py-2">
        {recordingUi ? (
          <div className="flex-1 flex items-center gap-3 h-11 px-3 rounded-full" style={{ background: "var(--mx-surface)" }}>
            <span className="w-2.5 h-2.5 rounded-full mx-rec-dot" style={{ background: "var(--mx-danger)" }} />
            <span className="tabular-nums w-11">{formatDuration(voice.seconds)}</span>
            <div className="flex-1 flex items-center gap-[2px] h-6 overflow-hidden">
              {voice.levels.map((l, i) => (
                <span key={i} className="w-[3px] rounded-full shrink-0" style={{ height: `${Math.max(12, l * 100)}%`, background: "var(--mx-accent)" }} />
              ))}
            </div>
            {locked ? (
              <button onClick={cancelLocked} className="p-1" style={{ color: "var(--mx-danger)" }} aria-label="Отменить запись">
                <Trash2 size={20} />
              </button>
            ) : (
              <span className="mx-muted text-[13px] whitespace-nowrap" style={{ transform: `translateX(${dragX / 3}px)`, opacity: 1 - Math.min(1, Math.abs(dragX) / 120) }}>
                ‹ Свайп — отмена
              </span>
            )}
          </div>
        ) : (
          <>
            <button onClick={() => setAttachOpen(true)} className="w-11 h-11 rounded-full flex items-center justify-center mx-muted shrink-0" aria-label="Прикрепить">
              <Paperclip size={23} />
            </button>
            <div className="flex-1 flex items-end rounded-[22px] pl-4 pr-1" style={{ background: "var(--mx-surface)", border: "1px solid var(--mx-line)" }}>
              <textarea
                ref={taRef}
                value={text}
                rows={1}
                placeholder="Сообщение"
                className="mx-composer-input"
                onChange={(e) => {
                  setText(e.target.value);
                  if (e.target.value) onTyping();
                }}
                onKeyDown={onKeyDown}
                onPaste={onPaste}
                onFocus={() => setEmojiOpen(false)}
                enterKeyHint="enter"
              />
              <button onClick={() => setEmojiOpen((v) => !v)} className="w-10 h-10 flex items-center justify-center mx-muted shrink-0" aria-label="Эмодзи">
                {emojiOpen ? <Keyboard size={22} /> : <Smile size={22} />}
              </button>
            </div>
          </>
        )}

        {hasText || editing ? (
          <button onClick={submit} className="w-11 h-11 rounded-full flex items-center justify-center shrink-0 mx-pop" style={{ background: "var(--mx-accent)", color: "var(--mx-accent-text)" }} aria-label="Отправить">
            {editing ? <Check size={22} /> : <Send size={20} className="ml-0.5" />}
          </button>
        ) : locked ? (
          <button onClick={sendLocked} className="w-11 h-11 rounded-full flex items-center justify-center shrink-0" style={{ background: "var(--mx-accent)", color: "var(--mx-accent-text)" }} aria-label="Отправить голосовое">
            <Send size={20} className="ml-0.5" />
          </button>
        ) : (
          <button
            onPointerDown={onMicDown}
            onPointerMove={onMicMove}
            onPointerUp={onMicUp}
            onPointerCancel={() => {
              clearTimeout(hold.current.timer);
              if (voice.recording && !hold.current.locked) voice.cancel();
            }}
            onContextMenu={(e) => e.preventDefault()}
            className="w-11 h-11 rounded-full flex items-center justify-center shrink-0 touch-none select-none"
            style={{ background: recordingUi ? "var(--mx-accent)" : "transparent", color: recordingUi ? "var(--mx-accent-text)" : "var(--mx-muted)", transform: recordingUi ? "scale(1.5)" : undefined, transition: "transform 0.15s" }}
            aria-label={mode === "voice" ? "Голосовое сообщение (удерживай)" : "Видеосообщение"}
          >
            {recordingUi && !locked ? <Lock size={0} /> : null}
            {mode === "voice" ? <Mic size={24} /> : <Video size={24} />}
          </button>
        )}
      </div>

      {recordingUi && !locked && (
        <p className="text-center text-[12px] mx-muted pb-1">Потяни вверх — зафиксировать, влево — отменить</p>
      )}

      {emojiOpen && <EmojiPanel onPick={insertEmoji} />}

      <input ref={mediaInput} type="file" accept="image/*,video/mp4,video/quicktime,video/webm" multiple hidden onChange={(e) => { pickFiles(e.target.files, "media"); e.target.value = ""; }} />
      <input ref={cameraInput} type="file" accept="image/*,video/*" capture="environment" hidden onChange={(e) => { pickFiles(e.target.files, "media"); e.target.value = ""; }} />
      <input ref={fileInput} type="file" hidden onChange={(e) => { pickFiles(e.target.files, "file"); e.target.value = ""; }} />

      <Sheet open={attachOpen} onClose={() => setAttachOpen(false)}>
        <MenuList
          onDone={() => setAttachOpen(false)}
          items={[
            { label: "Фото или видео", icon: <ImageIcon size={21} />, onPress: () => mediaInput.current?.click() },
            { label: "Камера", icon: <Camera size={21} />, onPress: () => cameraInput.current?.click() },
            { label: "Файл", icon: <FileIcon size={21} />, onPress: () => fileInput.current?.click() },
          ]}
        />
      </Sheet>

      {videoOpen && (
        <VideoNoteRecorder
          onCancel={() => setVideoOpen(false)}
          onSend={(v) => {
            setVideoOpen(false);
            onSendVideoNote(v);
          }}
        />
      )}
    </div>
  );
}
