"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Eye, Plus, Send, Trash2, X } from "lucide-react";
import { useToast } from "@/lib/toastContext";
import { safeImageSrc } from "@/lib/safeImage";
import { mApi, mUpload, MApiError } from "./api";
import { Avatar, Sheet } from "./ui";
import { useAccounts } from "./hooks";
import { MAccount, MStory } from "./mtypes";
import { MX_FEATURES } from "./features";
import { formatTime } from "./util";

export interface StoryGroup {
  uid: string;
  stories: MStory[];
  allSeen: boolean;
}

export function groupStories(stories: MStory[], me: string): StoryGroup[] {
  const map = new Map<string, MStory[]>();
  stories
    .filter((s) => s.expiresAt > Date.now())
    .sort((a, b) => a.createdAt - b.createdAt)
    .forEach((s) => map.set(s.uid, [...(map.get(s.uid) ?? []), s]));
  const groups: StoryGroup[] = Array.from(map.entries()).map(([uid, list]) => ({ uid, stories: list, allSeen: uid === me || list.every((s) => s.viewers?.includes(me)) }));
  // свои — первыми, дальше непросмотренные, потом просмотренные
  return groups.sort((a, b) => (a.uid === me ? -1 : b.uid === me ? 1 : Number(a.allSeen) - Number(b.allSeen)));
}

/** Ряд аватарок историй: «Моя история» с плюсом первой, дальше контакты (непросмотренные — с цветным кольцом). */
export function StoriesRow({ groups, me, myAccount, accounts, onOpen, onCreate }: { groups: StoryGroup[]; me: string; myAccount: MAccount; accounts: Record<string, MAccount | null>; onOpen: (uid: string) => void; onCreate: () => void }) {
  const mine = groups.find((g) => g.uid === me);
  const others = groups.filter((g) => g.uid !== me);
  return (
    <div className="relative">
      <div className="flex gap-3 overflow-x-auto vc-noscrollbar px-4 pb-3 pt-1" style={{ scrollSnapType: "x proximity" }}>
        <div className="flex flex-col items-center gap-1.5 shrink-0 w-[66px]" style={{ scrollSnapAlign: "start" }}>
          <button onClick={() => (mine ? onOpen(me) : onCreate())} className="relative" aria-label="Моя история">
            <Avatar src={myAccount.photoURL} name={myAccount.displayName} seed={me} size={56} ring={mine ? "unseen" : undefined} />
          </button>
          <button
            onClick={onCreate}
            className="absolute flex items-center justify-center rounded-full"
            style={{ width: 22, height: 22, marginTop: 38, marginLeft: 40, background: "var(--vc-accent)", color: "var(--vc-accent-text)", border: "2.5px solid var(--vc-bg)" }}
            aria-label="Добавить историю"
          >
            <Plus size={13} strokeWidth={3.2} />
          </button>
          <span className="text-[11.5px] vc-muted truncate w-full text-center">Моя история</span>
        </div>
        {others.map((g) => {
          const a = accounts[g.uid];
          return (
            <button key={g.uid} onClick={() => onOpen(g.uid)} className="flex flex-col items-center gap-1.5 shrink-0 w-[66px]" style={{ scrollSnapAlign: "start" }}>
              <Avatar src={a?.photoURL} name={a?.displayName ?? "?"} seed={g.uid} size={56} ring={g.allSeen ? "seen" : "unseen"} />
              <span className="text-[11.5px] truncate w-full text-center" style={{ color: g.allSeen ? "var(--vc-muted)" : "var(--vc-text)", fontWeight: g.allSeen ? 400 : 600 }}>{a?.displayName?.split(" ")[0] ?? "…"}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const IMAGE_MS = 5000;

export function StoryViewer({ groups, startUid, me, onClose, onChanged, onOpenChat }: { groups: StoryGroup[]; startUid: string; me: string; onClose: () => void; onChanged: () => void; onOpenChat: (chatId: string) => void }) {
  const { toast } = useToast();
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [gi, setGi] = useState(Math.max(0, groups.findIndex((g) => g.uid === startUid)));
  const [si, setSi] = useState(0);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reply, setReply] = useState("");
  const [viewersOpen, setViewersOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const holdTimer = useRef<any>(null);
  const swipe = useRef({ x: 0, y: 0 });
  const heldRef = useRef(false);
  const group = groups[gi];
  const story = group?.stories[si];
  const accounts = useAccounts(group ? [group.uid] : []);
  const viewerAccounts = useAccounts(story?.viewers ?? []);
  const mine = group?.uid === me;

  useEffect(() => setTarget(document.getElementById("vc-root")), []);

  const next = useCallback(() => {
    if (!group) return;
    if (si < group.stories.length - 1) {
      setSi(si + 1);
      setProgress(0);
    } else if (gi < groups.length - 1) {
      setGi(gi + 1);
      setSi(0);
      setProgress(0);
    } else onClose();
  }, [group, si, gi, groups.length, onClose]);

  const prev = useCallback(() => {
    if (si > 0) {
      setSi(si - 1);
    } else if (gi > 0) {
      setGi(gi - 1);
      setSi(0);
    }
    setProgress(0);
  }, [si, gi]);

  // отметка «просмотрено»
  useEffect(() => {
    if (story && !mine && !story.viewers?.includes(me)) mApi("stories/view", { storyId: story.id }).then(onChanged).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [story?.id]);

  // таймер прогресса: время копится в ref, переход вперёд срабатывает ровно один раз (раньше мог перескакивать через историю)
  const elapsed = useRef(0);
  const finished = useRef(false);
  useEffect(() => {
    elapsed.current = 0;
    finished.current = false;
    setProgress(0);
  }, [story?.id]);

  useEffect(() => {
    if (!story || paused || viewersOpen) return;
    let raf = 0;
    let last = performance.now();
    const tick = (t: number) => {
      const dt = t - last;
      last = t;
      elapsed.current += dt;
      const v = videoRef.current;
      let p: number;
      if (story.kind === "video" && v && Number.isFinite(v.duration) && v.duration > 0) p = v.currentTime / Math.min(v.duration, 15);
      else p = elapsed.current / IMAGE_MS;
      p = Math.max(0, Math.min(1, p));
      setProgress(p);
      if (p >= 1 && !finished.current) {
        finished.current = true;
        next();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [story?.id, paused, viewersOpen, next]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (paused || viewersOpen) v.pause();
    else v.play().catch(() => {});
  }, [paused, viewersOpen, story?.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev, onClose]);

  const sendReply = async () => {
    const text = reply.trim();
    if (!text || !group) return;
    setReply("");
    try {
      const handle = accounts[group.uid]?.handle;
      if (!handle) throw new Error("Не удалось определить получателя");
      const res = await mApi<{ chatId?: string; id?: string }>("chats", { type: "dm", memberHandles: [handle] });
      const chatId = res.chatId ?? res.id;
      if (!chatId) throw new Error("no chat");
      await mApi("send", { chatId, kind: "text", text: `Ответ на историю: ${text}` });
      toast("success", "Ответ отправлен");
    } catch (err) {
      toast("error", err instanceof MApiError ? err.message : "Не удалось отправить ответ");
    }
  };

  const remove = async () => {
    if (!story || !confirm("Удалить эту историю?")) return;
    try {
      await mApi("stories", { storyId: story.id }, "DELETE");
      onChanged();
      if (group.stories.length <= 1) onClose();
      else next();
    } catch (err) {
      toast("error", err instanceof MApiError ? err.message : "Не удалось удалить");
    }
  };

  if (!target || !group || !story) return null;
  const author = accounts[group.uid];

  const onDown = () => {
    heldRef.current = false;
    holdTimer.current = setTimeout(() => {
      heldRef.current = true;
      setPaused(true);
    }, 220);
  };
  const onUp = (side: "l" | "r") => {
    clearTimeout(holdTimer.current);
    if (heldRef.current) {
      setPaused(false);
      return;
    }
    side === "l" ? prev() : next();
  };

  return createPortal(
    <div className="absolute inset-0 flex items-center justify-center vc-fade" style={{ zIndex: 90, background: "#000" }} onContextMenu={(e) => e.preventDefault()}>
     <div
       className="flex flex-col w-full h-full min-[900px]:h-[min(100%,860px)] min-[900px]:max-w-[480px] min-[900px]:rounded-[22px] overflow-hidden relative select-none"
       style={{ background: "#000", WebkitTouchCallout: "none" }}
       onTouchStart={(e) => { swipe.current = { y: e.touches[0].clientY, x: e.touches[0].clientX }; }}
       onTouchEnd={(e) => {
         const t = e.changedTouches[0];
         if (t.clientY - swipe.current.y > 110 && Math.abs(t.clientX - swipe.current.x) < 70) onClose(); // свайп вниз закрывает
       }}
     >
      <div className="relative flex-1 min-h-0">
        {story.kind === "video" ? (
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <video ref={videoRef} key={story.id} src={story.mediaUrl} className="absolute inset-0 w-full h-full object-contain" autoPlay playsInline />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={story.id} src={safeImageSrc(story.mediaUrl)} alt="" className="absolute inset-0 w-full h-full object-contain" draggable={false} />
        )}

        {/* зоны нажатия: левая треть — назад, остальное — вперёд; удержание — пауза */}
        <div className="absolute inset-0 flex" style={{ touchAction: "manipulation" }}>
          <div className="h-full" style={{ width: "33%" }} onPointerDown={onDown} onPointerUp={() => onUp("l")} onPointerLeave={() => { clearTimeout(holdTimer.current); if (heldRef.current) setPaused(false); }} />
          <div className="h-full flex-1" onPointerDown={onDown} onPointerUp={() => onUp("r")} onPointerLeave={() => { clearTimeout(holdTimer.current); if (heldRef.current) setPaused(false); }} />
        </div>

        <div className="absolute top-0 inset-x-0 px-3 pb-6 pointer-events-none" style={{ paddingTop: "calc(env(safe-area-inset-top) + 8px)", background: "linear-gradient(rgba(0,0,0,0.55), transparent)" }}>
          <div className="flex gap-1">
            {group.stories.map((s, i) => (
              <span key={s.id} className="h-[3px] flex-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.3)" }}>
                <span className="block h-full bg-white" style={{ width: `${i < si ? 100 : i === si ? progress * 100 : 0}%` }} />
              </span>
            ))}
          </div>
          <div className="flex items-center gap-2.5 mt-2.5 text-white pointer-events-auto">
            <Avatar src={author?.photoURL} name={author?.displayName ?? "?"} seed={group.uid} size={34} />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-[14.5px] truncate">{mine ? "Моя история" : author?.displayName}</p>
              <p className="text-[12px] opacity-75">{formatTime(story.createdAt)}</p>
            </div>
            {mine && <button onClick={remove} className="p-2" aria-label="Удалить"><Trash2 size={20} /></button>}
            <button onClick={onClose} className="p-2" aria-label="Закрыть"><X size={24} /></button>
          </div>
        </div>

        {story.caption && (
          <p className="absolute inset-x-0 bottom-0 px-5 py-4 text-white text-center text-[16px] pointer-events-none" style={{ background: "linear-gradient(transparent, rgba(0,0,0,0.65))" }}>{story.caption}</p>
        )}
      </div>

      <div className="px-3 py-2.5 vc-safe-bottom" style={{ background: "#000" }}>
        {mine ? (
          <button onClick={() => setViewersOpen(true)} className="flex items-center gap-2 text-white/85 mx-auto py-1.5">
            <Eye size={18} /> {story.viewers?.length ?? 0} {(story.viewers?.length ?? 0) === 1 ? "просмотр" : "просмотров"}
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <input
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              onFocus={() => setPaused(true)}
              onBlur={() => setPaused(false)}
              onKeyDown={(e) => e.key === "Enter" && sendReply()}
              placeholder="Ответить на историю…"
              className="flex-1 h-11 rounded-full px-4 outline-none text-white text-[16px]"
              style={{ background: "rgba(255,255,255,0.14)" }}
            />
            {reply.trim() && (
              <button onClick={sendReply} className="w-11 h-11 rounded-full flex items-center justify-center" style={{ background: "var(--vc-accent)", color: "var(--vc-accent-text)" }} aria-label="Отправить">
                <Send size={19} />
              </button>
            )}
          </div>
        )}
      </div>

     </div>
      <Sheet open={viewersOpen} onClose={() => setViewersOpen(false)} title="Просмотры" zIndex={95}>
        <div className="pb-6">
          {(story.viewers ?? []).length === 0 && <p className="vc-muted text-center py-6">Пока никто не смотрел</p>}
          {(story.viewers ?? []).map((u) => (
            <div key={u} className="flex items-center gap-3 px-5 py-2.5">
              <Avatar src={viewerAccounts[u]?.photoURL} name={viewerAccounts[u]?.displayName ?? "?"} seed={u} size={40} />
              <span>{viewerAccounts[u]?.displayName ?? "Пользователь"}</span>
            </div>
          ))}
        </div>
      </Sheet>
    </div>,
    target
  );
}

export function StoryCreator({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const reset = () => { setFile(null); setCaption(""); setBusy(false); setProgress(0); };

  const pick = (f: File | undefined) => {
    if (!f) return;
    const isVideo = f.type.startsWith("video/");
    if (f.size > 25 * 1024 * 1024) return toast("error", "Файл слишком большой (максимум 25 МБ)");
    if (!isVideo) return setFile(f);
    if (!MX_FEATURES.upload) return toast("info", "Видео в историях появится позже — пока можно фото");
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => {
      URL.revokeObjectURL(v.src);
      if (v.duration > 15.5) toast("error", "Видео в истории — не длиннее 15 секунд");
      else setFile(f);
    };
    v.onerror = () => setFile(f);
    v.src = URL.createObjectURL(f);
  };

  const publish = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const kind = file.type.startsWith("video/") ? "video" : "image";
      const up = await mUpload(file, "story", { onProgress: setProgress });
      await mApi("stories", { kind, mediaUrl: up.url, caption: caption.trim() || undefined });
      toast("success", "История опубликована на 24 часа");
      reset();
      onClose();
      onCreated();
    } catch (err) {
      toast("error", err instanceof MApiError ? err.message : "Не удалось опубликовать");
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={() => { reset(); onClose(); }} title="Новая история" full>
      <div className="p-4 space-y-3 pb-8">
        <input ref={input} type="file" accept={MX_FEATURES.upload ? "image/*,video/mp4,video/quicktime,video/webm" : "image/*"} hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
        {previewUrl && file ? (
          <div className="rounded-2xl overflow-hidden bg-black flex items-center justify-center" style={{ height: 360 }}>
            {file.type.startsWith("video/") ? (
              // eslint-disable-next-line jsx-a11y/media-has-caption
              <video src={previewUrl} className="max-h-full max-w-full" controls playsInline />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewUrl} alt="" className="max-h-full max-w-full object-contain" />
            )}
          </div>
        ) : (
          <button onClick={() => input.current?.click()} className="w-full rounded-2xl flex flex-col items-center justify-center gap-2 vc-muted" style={{ height: 220, background: "var(--vc-surface2)", border: "1.5px dashed var(--vc-line)" }}>
            <Plus size={30} />
            Выбрать фото или видео (до 15 с)
          </button>
        )}
        {file && (
          <>
            <input className="vc-input" placeholder="Подпись (необязательно)" maxLength={120} value={caption} onChange={(e) => setCaption(e.target.value)} />
            {busy && <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--vc-surface2)" }}><div className="h-full" style={{ width: `${Math.round(progress * 100)}%`, background: "var(--vc-accent)" }} /></div>}
            <button className="vc-btn" disabled={busy} onClick={publish}>{busy ? "Публикую…" : "Опубликовать"}</button>
            <button className="vc-btn vc-btn-ghost" disabled={busy} onClick={() => input.current?.click()}>Выбрать другое</button>
          </>
        )}
        <p className="vc-muted text-[13px] text-center">История исчезнет через 24 часа. Её увидят ваши контакты.</p>
      </div>
    </Sheet>
  );
}
