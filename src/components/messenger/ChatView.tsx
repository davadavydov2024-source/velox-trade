"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { collection, doc, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { Archive, ArrowLeft, BadgeCheck, BarChart3, BellOff, CheckCheck, Check, ChevronDown, Copy, Flag, Forward, ImagePlus, Loader2, Mic, MoreVertical, Pencil, Pin, Plus, Reply, Send, Smile, Star, Trash2, X } from "lucide-react";
import { db } from "@/lib/firebase";
import { useToast } from "@/lib/toastContext";
import { mApi, uploadMedia, useAccounts } from "@/lib/messenger/client";
import { ALLOWED_REACTIONS, MessengerAccount, MessengerChat, MessengerMessage, MessengerUserChat } from "@/lib/messenger/types";
import { Accs, Avatar, Sheet, chatMeta, cx, fmtClock, fmtDay, lastSeenText } from "./mui";
import { ChatInfo, PollCreator, StickerPanel } from "./ChatExtras";

const WALLPAPER = "radial-gradient(1200px 600px at 10% -10%, rgba(255,152,0,0.10), transparent 60%), radial-gradient(900px 500px at 100% 110%, rgba(255,64,129,0.10), transparent 60%), #0d1017";

// ---------- Опрос ----------
function PollView({ chatId, msg, uid, mine }: { chatId: string; msg: MessengerMessage; uid: string; mine: boolean }) {
  const { toast } = useToast();
  const poll = msg.poll!;
  const [votes, setVotes] = useState<number[]>([]);
  const [quiz, setQuiz] = useState<{ correct: number | null; explanation: string } | null>(null);
  useEffect(() => onSnapshot(doc(db, "messengerChats", chatId, "messages", msg.id, "votes", uid), (s) => setVotes((s.data()?.options as number[]) ?? []), () => {}), [chatId, msg.id, uid]);

  async function vote(i: number) {
    if (poll.closed) return;
    try {
      if (!poll.multiple && votes[0] === i) { if (!poll.quiz) await mApi("poll", { chatId, msgId: msg.id, action: "retract" }); return; }
      const next = poll.multiple ? (votes.includes(i) ? votes.filter((x) => x !== i) : [...votes, i]) : [i];
      const r = await mApi<{ correct?: number | null; explanation?: string }>("poll", { chatId, msgId: msg.id, action: next.length ? "vote" : "retract", options: next });
      if (poll.quiz) setQuiz({ correct: r.correct ?? null, explanation: r.explanation ?? "" });
    } catch (e: any) { toast("error", e?.message || "Не удалось проголосовать"); }
  }
  const voted = votes.length > 0;
  return (
    <div className="min-w-[220px] space-y-1.5">
      <p className="font-semibold">{msg.text}</p>
      <p className={cx("text-[11px]", mine ? "text-black/60" : "text-white/40")}>{poll.quiz ? "Викторина" : poll.anonymous ? "Анонимный опрос" : "Опрос"}{poll.multiple ? " · несколько ответов" : ""}{poll.closed ? " · закрыт" : ""}</p>
      {poll.options.map((o, i) => {
        const pct = poll.total ? Math.round((o.count / poll.total) * 100) : 0;
        const picked = votes.includes(i);
        return (
          <button key={i} onClick={() => vote(i)} className="w-full text-left relative overflow-hidden rounded-lg border border-current/20 px-2.5 py-1.5 text-sm">
            {(voted || poll.closed) && <span className={cx("absolute inset-y-0 left-0", mine ? "bg-black/15" : "bg-accent/25")} style={{ width: `${pct}%` }} />}
            <span className="relative flex justify-between gap-2"><span>{picked ? "✓ " : ""}{quiz?.correct === i ? "✅ " : ""}{o.text}</span>{(voted || poll.closed) && <span className="opacity-70">{pct}%</span>}</span>
          </button>
        );
      })}
      <p className={cx("text-[11px]", mine ? "text-black/60" : "text-white/40")}>{poll.total} голос(ов)</p>
      {quiz?.explanation && <p className="text-xs italic">{quiz.explanation}</p>}
    </div>
  );
}

// ---------- Сообщение ----------
function Bubble({ m, mine, chat, uid, accs, readByOther, onMenu, onReact, onLightbox, onJump }: {
  m: MessengerMessage; mine: boolean; chat: MessengerChat; uid: string; accs: Accs; readByOther: boolean;
  onMenu: (m: MessengerMessage) => void; onReact: (m: MessengerMessage, e: string) => void; onLightbox: (u: string) => void; onJump: (id: string) => void;
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const press = { onTouchStart: () => { timer.current = setTimeout(() => onMenu(m), 450); }, onTouchEnd: () => timer.current && clearTimeout(timer.current), onTouchMove: () => timer.current && clearTimeout(timer.current), onContextMenu: (e: React.MouseEvent) => { e.preventDefault(); onMenu(m); } };
  const plain = m.kind === "sticker" || m.kind === "videoNote";
  const reactions = Object.entries(m.reactions ?? {}).filter(([, u]) => u.length > 0);
  const sender = chat.type !== "dm" && !mine ? accs[m.from]?.displayName : undefined;

  if (m.deletedForAll) return <p className="text-center text-xs text-white/30 italic py-1">Сообщение удалено</p>;
  return (
    <div id={`msg-${m.id}`} className={cx("flex mb-1", mine ? "justify-end" : "justify-start")}>
      <div className={cx("max-w-[82%] sm:max-w-[70%]", "flex flex-col", mine ? "items-end" : "items-start")}>
        <div {...press} className={cx("select-none [-webkit-touch-callout:none] text-[15px] leading-snug", plain ? "" : cx("px-3 py-2 rounded-2xl shadow-sm", mine ? "bg-gradient-to-br from-accent to-accent-dark text-black rounded-br-md" : "bg-surface border border-white/5 rounded-bl-md"))}>
          {sender && <p className="text-xs font-semibold text-accent mb-0.5">{sender}</p>}
          {m.forwardedFrom && <p className={cx("text-xs mb-1", mine ? "text-black/60" : "text-accent")}>Переслано от {m.forwardedFrom.name}</p>}
          {m.replyTo && (
            <button onClick={() => onJump(m.replyTo!.msgId)} className={cx("block text-left text-xs border-l-2 pl-2 mb-1 max-w-full", mine ? "border-black/40 text-black/70" : "border-accent text-white/60")}>
              <b>{accs[m.replyTo.from]?.displayName ?? (m.replyTo.from === uid ? "Вы" : "…")}</b><br /><span className="line-clamp-1">{m.replyTo.preview}</span>
            </button>
          )}
          {m.kind === "image" && m.mediaUrl && /* eslint-disable-next-line @next/next/no-img-element */ <img src={m.mediaUrl} alt="" loading="lazy" onClick={() => onLightbox(m.mediaUrl!)} className="rounded-xl max-h-72 w-auto object-cover cursor-zoom-in mb-1" />}
          {m.kind === "sticker" && m.mediaUrl && (m.mediaUrl.endsWith(".webm") ? <video src={m.mediaUrl} autoPlay loop muted playsInline className="w-36 h-36 object-contain" /> : /* eslint-disable-next-line @next/next/no-img-element */ <img src={m.mediaUrl} alt="" className="w-36 h-36 object-contain" />)}
          {m.kind === "voice" && m.mediaUrl && <audio controls preload="none" src={m.mediaUrl} className="h-9 w-[220px] max-w-full" />}
          {m.kind === "videoNote" && m.mediaUrl && <video src={m.mediaUrl} controls playsInline className="w-52 h-52 rounded-full object-cover" />}
          {m.kind === "file" && m.mediaUrl && <a href={m.mediaUrl} target="_blank" rel="noopener noreferrer" className="underline">📎 Файл</a>}
          {m.kind === "poll" && m.poll ? <PollView chatId={chat.id} msg={m} uid={uid} mine={mine} /> : m.text && m.kind !== "sticker" ? <p className="whitespace-pre-wrap break-words">{m.text}</p> : null}
          {!plain && (
            <p className={cx("text-[10px] text-right mt-0.5 flex items-center justify-end gap-1", mine ? "text-black/55" : "text-white/40")}>
              {chat.type === "channel" && <span>👁 {m.views ?? 0}</span>}
              {m.editedAt && <span>изменено</span>}
              {fmtClock(m.createdAt)}
              {mine && chat.type === "dm" && (readByOther ? <CheckCheck size={14} /> : <Check size={14} />)}
            </p>
          )}
        </div>
        {reactions.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-0.5">
            {reactions.map(([e, u]) => (
              <button key={e} onClick={() => onReact(m, e)} className={cx("px-1.5 py-0.5 rounded-full text-xs flex items-center gap-1 border", u.includes(uid) ? "bg-accent/25 border-accent/60" : "bg-white/5 border-white/10")}>{e} {u.length}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- Окно чата ----------
export function ChatView({ uid, account, chat, uc, allChats, ucs, onBack }: {
  uid: string; account: MessengerAccount; chat: MessengerChat; uc?: MessengerUserChat; allChats: MessengerChat[]; ucs: Record<string, MessengerUserChat>; onBack: () => void;
}) {
  const { toast } = useToast();
  const accs = useAccounts(chat.members.slice(0, 80));
  const allAccs = useAccounts(useMemo(() => allChats.filter((c) => c.type === "dm").flatMap((c) => c.members).slice(0, 100), [allChats]));
  const meta = chatMeta(chat, uid, accs);

  const [msgs, setMsgs] = useState<MessengerMessage[]>([]);
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<MessengerMessage | null>(null);
  const [editing, setEditing] = useState<MessengerMessage | null>(null);
  const [menu, setMenu] = useState<MessengerMessage | null>(null);
  const [fwd, setFwd] = useState<string[] | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [chatMenu, setChatMenu] = useState(false);
  const [busy, setBusy] = useState(false);
  const [typingRaw, setTypingRaw] = useState<Record<string, number>>({});
  const [tick, setTick] = useState(0);
  const [recording, setRecording] = useState(false);
  const [recSecs, setRecSecs] = useState(0);
  const [infoOpen, setInfoOpen] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [stickersOpen, setStickersOpen] = useState(false);
  const [pollOpen, setPollOpen] = useState(false);
  const [showDown, setShowDown] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const fileRef = useRef<HTMLInputElement>(null);
  const rec = useRef<{ r: MediaRecorder; chunks: Blob[]; start: number; stream: MediaStream; send: boolean } | null>(null);
  const lastTyping = useRef(0);
  const viewed = useRef(new Set<string>());

  useEffect(() => onSnapshot(query(collection(db, "messengerChats", chat.id, "messages"), orderBy("createdAt", "desc"), limit(120)), (s) => setMsgs(s.docs.map((d) => ({ id: d.id, ...d.data() }) as MessengerMessage).reverse()), (e) => console.error("messages", e)), [chat.id]);
  useEffect(() => onSnapshot(collection(db, "messengerChats", chat.id, "typing"), (s) => { const m: Record<string, number> = {}; s.docs.forEach((d) => (m[d.id] = d.data().at ?? 0)); setTypingRaw(m); }, () => {}), [chat.id]);
  useEffect(() => { const t = setInterval(() => setTick((n) => n + 1), 2500); return () => clearInterval(t); }, []);

  const visible = useMemo(() => msgs.filter((m) => !m.hiddenFor?.includes(uid) && !(m.expireAt && m.expireAt <= Date.now()) && !(uc?.clearedAt && m.createdAt <= uc.clearedAt)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [msgs, uid, uc?.clearedAt, tick]);
  const typingNow = Object.entries(typingRaw).filter(([u, at]) => u !== uid && Date.now() - at < 5000).map(([u]) => u);

  const isAdmin = chat.createdBy === uid || chat.admins.includes(uid);
  const restricted = (() => { const r = chat.restricted?.[uid]; return !!r && r.until > Date.now() && r.sendMessages === false; })();
  const canWrite = !chat.service && !restricted && (chat.type === "channel" ? isAdmin : chat.type === "group" ? isAdmin || chat.permissions?.sendMessages !== false : true);
  const other = chat.type === "dm" ? chat.members.find((m) => m !== uid) : undefined;

  const lastIncoming = [...visible].reverse().find((m) => m.from !== uid);
  useEffect(() => {
    if (!lastIncoming || document.visibilityState !== "visible") return;
    if ((chat.readBy?.[uid] ?? 0) >= lastIncoming.createdAt && !uc?.unread && !uc?.markedUnread) return;
    const t = setTimeout(() => mApi("read", { chatId: chat.id }).catch(() => {}), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastIncoming?.id, uc?.unread, uc?.markedUnread]);

  useEffect(() => {
    if (chat.type !== "channel") return;
    const ids = visible.slice(-30).filter((m) => !viewed.current.has(m.id) && !m.deletedForAll).map((m) => m.id);
    if (!ids.length) return;
    ids.forEach((i) => viewed.current.add(i));
    mApi("channel-view", { chatId: chat.id, msgIds: ids }).catch(() => {});
  }, [visible, chat.type, chat.id]);

  useEffect(() => { const el = scroller.current; if (el && stick.current) el.scrollTop = el.scrollHeight; }, [visible.length, typingNow.length]);
  const onScroll = () => { const el = scroller.current; if (!el) return; const d = el.scrollHeight - el.scrollTop - el.clientHeight; stick.current = d < 120; setShowDown(d > 320); };
  const jump = (id: string) => document.getElementById(`msg-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });

  const fail = (e: any) => toast("error", e?.message || "Не получилось");
  const send = async (payload: Record<string, unknown>) => { await mApi("send", { chatId: chat.id, replyTo: replyTo?.id, ...payload }); setReplyTo(null); stick.current = true; };

  async function sendText() {
    const t = text.trim();
    if (!t || busy) return;
    if (editing) {
      try { await mApi("edit", { chatId: chat.id, msgId: editing.id, text: t }); setEditing(null); setText(""); } catch (e) { fail(e); }
      return;
    }
    setText("");
    try { await send({ kind: "text", text: t }); } catch (e) { setText(t); fail(e); }
  }

  async function sendSticker(slug: string, index: number) {
    setStickersOpen(false);
    try { await send({ kind: "sticker", stickerPack: slug, stickerIndex: index }); }
    catch (e: any) { toast("error", e?.data?.needPremium ? "Эти стикеры доступны с Mili Premium ⭐ (Настройки → Mili Premium)" : e?.message || "Не получилось"); }
  }
  const sendPoll = async (poll: Record<string, unknown>) => { await send({ kind: "poll", poll }); };

  async function pickImage(f?: File) {
    if (!f) return;
    setBusy(true);
    try {
      const url = await uploadMedia(f, "image", (f.type.split("/")[1] || "jpg").replace("jpeg", "jpg"));
      await send({ kind: "image", mediaUrl: url, text: text.trim() || undefined });
      setText("");
    } catch (e) { fail(e); } finally { setBusy(false); if (fileRef.current) fileRef.current.value = ""; }
  }

  async function startRec() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"].find((t) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t));
      const r = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const st = { r, chunks: [] as Blob[], start: Date.now(), stream, send: false };
      r.ondataavailable = (e) => e.data.size && st.chunks.push(e.data);
      r.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        if (!st.send) return;
        const dur = (Date.now() - st.start) / 1000;
        if (dur < 0.7) return;
        setBusy(true);
        try {
          const blob = new Blob(st.chunks, { type: r.mimeType || "audio/webm" });
          const url = await uploadMedia(blob, "voice", blob.type.includes("mp4") ? "m4a" : "webm");
          await send({ kind: "voice", mediaUrl: url, duration: Math.round(dur) });
        } catch (e) { fail(e); } finally { setBusy(false); }
      };
      rec.current = st;
      r.start();
      setRecSecs(0);
      setRecording(true);
    } catch { toast("error", "Нет доступа к микрофону — разреши его в настройках браузера"); }
  }
  useEffect(() => { if (!recording) return; const t = setInterval(() => setRecSecs((n) => n + 1), 1000); return () => clearInterval(t); }, [recording]);
  const stopRec = (send: boolean) => { if (rec.current) { rec.current.send = send; rec.current.r.stop(); } };

  const react = (m: MessengerMessage, e: string) => mApi("react", { chatId: chat.id, msgId: m.id, emoji: e }).catch(fail);
  const act = async (fn: () => Promise<unknown>, ok?: string) => { setMenu(null); setChatMenu(false); try { await fn(); if (ok) toast("success", ok); } catch (e) { fail(e); } };
  const setting = (patch: Record<string, unknown>, ok?: string) => act(() => mApi("chat-settings", { chatId: chat.id, ...patch }), ok);

  async function clearAll() {
    if (!confirm("Удалить всю переписку у ВСЕХ участников? Это нельзя отменить.")) return;
    await act(async () => { for (let i = 0; i < 20; i++) { const r = await mApi<{ done: boolean }>("clear-chat", { chatId: chat.id, forAll: true }); if (r.done) break; } }, "История очищена у всех");
  }

  const status = typingNow.length ? "печатает…" : chat.type === "dm" ? (meta.self ? "" : lastSeenText(meta.account)) : chat.type === "channel" ? `${chat.members.length} подписчиков` : `${chat.members.length} участников`;
  const pinnedMsg = [...visible].reverse().find((m) => chat.pinnedMessageIds?.includes(m.id) && !m.deletedForAll);

  return (
    <div className="h-full w-full flex flex-col bg-bg">
      <header className="shrink-0 flex items-center gap-2 px-2 py-2 border-b border-border bg-surface/80 backdrop-blur-md">
        <button onClick={onBack} className="lg:hidden w-9 h-9 flex items-center justify-center text-white/70"><ArrowLeft size={22} /></button>
        <button onClick={() => setInfoOpen(true)} className="flex items-center gap-2.5 min-w-0 flex-1 text-left">
        <Avatar name={meta.title} src={meta.photoURL} size={40} />
        <div className="min-w-0 flex-1">
          <p className="font-semibold truncate flex items-center gap-1">{meta.title}{(meta.verified || chat.service) && <BadgeCheck size={15} className="text-accent shrink-0" />}{meta.premium && <Star size={13} className="text-yellow-400 fill-yellow-400 shrink-0" />}</p>
          <p className={cx("text-xs truncate", typingNow.length || status === "в сети" ? "text-accent" : "text-white/40")}>{status}</p>
        </div>
        </button>
        <button onClick={() => setChatMenu(true)} className="w-9 h-9 flex items-center justify-center text-white/70"><MoreVertical size={20} /></button>
      </header>

      {pinnedMsg && (
        <button onClick={() => jump(pinnedMsg.id)} className="shrink-0 flex items-center gap-2 px-4 py-1.5 border-b border-border bg-surface/50 text-left">
          <Pin size={14} className="text-accent shrink-0" />
          <span className="text-xs text-white/70 truncate">{pinnedMsg.text || "Закреплённое сообщение"}</span>
        </button>
      )}

      <div className="relative flex-1 min-h-0">
      <div ref={scroller} onScroll={onScroll} style={{ background: WALLPAPER }} className="absolute inset-0 overflow-y-auto overscroll-contain px-3 py-2">
        {visible.length === 0 && <p className="text-center text-white/30 text-sm py-10">Сообщений пока нет.</p>}
        {visible.map((m, i) => {
          const prev = visible[i - 1];
          const newDay = !prev || new Date(prev.createdAt).toDateString() !== new Date(m.createdAt).toDateString();
          return (
            <div key={m.id}>
              {newDay && <p className="text-center text-xs text-white/40 my-2"><span className="bg-white/10 rounded-full px-3 py-1">{fmtDay(m.createdAt)}</span></p>}
              <Bubble m={m} mine={m.from === uid} chat={chat} uid={uid} accs={accs} readByOther={!!other && (chat.readBy?.[other] ?? 0) >= m.createdAt} onMenu={setMenu} onReact={react} onLightbox={setLightbox} onJump={jump} />
            </div>
          );
        })}
        {typingNow.length > 0 && <p className="text-xs text-accent px-2 py-1">{chat.type === "dm" ? "печатает…" : `${typingNow.map((u) => accs[u]?.displayName?.split(" ")[0] ?? "…").join(", ")} печатает…`}</p>}
      </div>
        {showDown && (
          <button onClick={() => { const el = scroller.current; if (el) { stick.current = true; el.scrollTo({ top: el.scrollHeight, behavior: "smooth" }); } }} className="absolute right-3 bottom-3 w-11 h-11 rounded-full bg-surface border border-border shadow-card flex items-center justify-center"><ChevronDown size={22} /></button>
        )}
      </div>

      {canWrite ? (
        <div className="shrink-0 border-t border-border bg-surface/85 backdrop-blur-md" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
          {stickersOpen && <StickerPanel onPick={sendSticker} />}
          {(replyTo || editing) && (
            <div className="flex items-center gap-2 px-4 pt-2 text-xs">
              {editing ? <Pencil size={14} className="text-accent" /> : <Reply size={14} className="text-accent" />}
              <span className="flex-1 truncate text-white/60">{editing ? "Редактирование" : `${replyTo!.from === uid ? "Вы" : accs[replyTo!.from]?.displayName ?? ""}: ${replyTo!.text ?? "Сообщение"}`}</span>
              <button onClick={() => { setReplyTo(null); setEditing(null); setText(""); }}><X size={16} /></button>
            </div>
          )}
          <div className="flex items-end gap-2 p-2">
            {recording ? (
              <>
                <button onClick={() => stopRec(false)} className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center shrink-0"><X size={20} /></button>
                <div className="flex-1 flex items-center gap-2 px-3 text-sm"><span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" /> Запись {Math.floor(recSecs / 60)}:{String(recSecs % 60).padStart(2, "0")}</div>
                <button onClick={() => stopRec(true)} className="w-10 h-10 rounded-full bg-accent text-black flex items-center justify-center shrink-0"><Send size={18} /></button>
              </>
            ) : (
              <>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => pickImage(e.target.files?.[0])} />
                <button onClick={() => setAttachOpen(true)} disabled={busy} className="w-10 h-10 flex items-center justify-center text-white/60 shrink-0">{busy ? <Loader2 size={20} className="animate-spin" /> : <Plus size={24} />}</button>
                <textarea
                  value={text} rows={1} placeholder="Сообщение" autoComplete="off"
                  onChange={(e) => { setText(e.target.value); e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 140) + "px"; if (e.target.value && Date.now() - lastTyping.current > 3000) { lastTyping.current = Date.now(); mApi("typing", { chatId: chat.id }).catch(() => {}); } }}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && window.matchMedia("(pointer:fine)").matches) { e.preventDefault(); sendText(); } }}
                  className="input-field flex-1 py-2.5 text-[15px] rounded-2xl resize-none max-h-[140px]"
                />
                <button onClick={() => setStickersOpen((v) => !v)} className={cx("w-9 h-10 flex items-center justify-center shrink-0", stickersOpen ? "text-accent" : "text-white/60")}><Smile size={22} /></button>
                {text.trim() ? (
                  <button onClick={sendText} className="w-10 h-10 rounded-full bg-accent text-black flex items-center justify-center shrink-0"><Send size={18} /></button>
                ) : (
                  <button onClick={startRec} disabled={busy} className="w-10 h-10 flex items-center justify-center text-white/60 shrink-0"><Mic size={22} /></button>
                )}
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="shrink-0 border-t border-border bg-surface/80 py-3 text-center text-sm" style={{ paddingBottom: "calc(12px + env(safe-area-inset-bottom))" }}>
          {chat.service ? <span className="text-white/40">Служебный чат MiliGram Push — отвечать нельзя</span>
            : restricted ? <span className="text-white/40">Тебе запрещено писать в этом чате</span>
            : chat.type === "channel" ? <button onClick={() => setting({ muted: !uc?.muted })} className="text-accent font-medium">{uc?.muted ? "Включить звук" : "Выключить звук"}</button>
            : <span className="text-white/40">Писать в этот чат нельзя</span>}
        </div>
      )}

      {/* Меню сообщения */}
      {menu && (
        <Sheet onClose={() => setMenu(null)}>
          <div className="p-3">
            <div className="flex justify-around pb-2 mb-1 border-b border-white/10">
              {ALLOWED_REACTIONS.map((e) => <button key={e} onClick={() => act(() => react(menu, e) as Promise<unknown>)} className="text-2xl p-1.5 active:scale-125 transition-transform">{e}</button>)}
            </div>
            {([
              !chat.service && canWrite && ["Ответить", Reply, () => { setReplyTo(menu); setMenu(null); }],
              menu.text && !chat.noForwards && ["Копировать", Copy, () => { navigator.clipboard?.writeText(menu.text!); setMenu(null); toast("success", "Скопировано"); }],
              menu.from === uid && ["text", "image"].includes(menu.kind) && ["Изменить", Pencil, () => { setEditing(menu); setText(menu.text ?? ""); setMenu(null); }],
              (chat.type === "dm" || isAdmin || chat.permissions?.pinMessages) && [chat.pinnedMessageIds?.includes(menu.id) ? "Открепить" : "Закрепить", Pin, () => act(() => mApi("pin", { chatId: chat.id, msgId: menu.id, pinned: !chat.pinnedMessageIds?.includes(menu.id) }))],
              !chat.noForwards && !chat.service && ["Переслать", Forward, () => { setFwd([menu.id]); setMenu(null); }],
              ["Удалить у меня", Trash2, () => act(() => mApi("delete", { chatId: chat.id, msgIds: [menu.id], forMe: true }))],
              !chat.service && (menu.from === uid || isAdmin) && ["Удалить у всех", Trash2, () => act(() => mApi("delete", { chatId: chat.id, msgIds: [menu.id] }))],
              menu.from !== uid && !chat.service && ["Пожаловаться", Flag, () => { const reason = prompt("Причина жалобы?"); if (reason) act(() => mApi("report", { chatId: chat.id, msgId: menu.id, reason }), "Жалоба отправлена"); }],
            ] as any[]).filter(Boolean).map(([label, Icon, fn]: any) => (
              <button key={label} onClick={fn} className={cx("w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-white/5 text-left", label.startsWith("Удалить") && "text-red-300")}><Icon size={19} /> {label}</button>
            ))}
          </div>
        </Sheet>
      )}

      {/* Меню чата */}
      {chatMenu && (
        <Sheet onClose={() => setChatMenu(false)} title={meta.title}>
          <div className="p-3">
            {([
              [uc?.pinned ? "Открепить чат" : "Закрепить чат", Pin, () => setting({ pinned: !uc?.pinned })],
              [uc?.muted ? "Включить звук" : "Без звука", BellOff, () => setting({ muted: !uc?.muted })],
              [uc?.archived ? "Вернуть из архива" : "В архив", Archive, () => setting({ archived: !uc?.archived })],
              ["Очистить историю у меня", Trash2, () => setting({ clearHistory: true }, "История очищена")],
              !chat.service && (chat.type === "dm" || isAdmin) && ["Очистить историю у всех", Trash2, clearAll],
              chat.type === "dm" && !meta.self && !chat.service && ["Заблокировать", Flag, () => confirm("Заблокировать пользователя?") && act(() => mApi("block", { handle: meta.account?.handle, blocked: true }), "Заблокирован")],
              chat.type !== "dm" && chat.createdBy !== uid && ["Покинуть чат", ArrowLeft, () => confirm("Покинуть чат?") && act(async () => { await mApi("members", { chatId: chat.id, action: "leave" }); onBack(); })],
              chat.type !== "dm" && chat.createdBy === uid && ["Удалить чат", Trash2, () => confirm("Удалить чат для всех?") && act(async () => { await mApi("members", { chatId: chat.id, action: "deleteChat" }); onBack(); })],
            ] as any[]).filter(Boolean).map(([label, Icon, fn]: any) => (
              <button key={label} onClick={fn} className={cx("w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-white/5 text-left", /Удалить|Очистить историю у всех|Заблокировать/.test(label) && "text-red-300")}><Icon size={19} /> {label}</button>
            ))}
          </div>
        </Sheet>
      )}

      {/* Пересылка */}
      {fwd && (
        <Sheet onClose={() => setFwd(null)} title="Переслать в…">
          <div className="p-2 pb-4">
            {allChats.filter((c) => !c.service && (c.type === "dm" || c.type === "group" || c.admins.includes(uid) || c.createdBy === uid) && !c.noForwards || c.id === chat.id).filter((c) => !c.service).map((c) => {
              const m = chatMeta(c, uid, allAccs);
              return (
                <button key={c.id} onClick={() => act(async () => { await mApi("forward", { fromChatId: chat.id, msgIds: fwd, toChatIds: [c.id] }); setFwd(null); }, "Переслано")} className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-white/5 text-left">
                  <Avatar name={m.title} src={m.photoURL} size={40} /><span className="truncate">{m.title}</span>
                </button>
              );
            })}
          </div>
        </Sheet>
      )}

      {attachOpen && (
        <Sheet onClose={() => setAttachOpen(false)}>
          <div className="p-3 pb-5">
            <button onClick={() => { setAttachOpen(false); fileRef.current?.click(); }} className="w-full flex items-center gap-3 px-3 py-3.5 rounded-xl hover:bg-white/5 text-left"><ImagePlus size={22} className="text-accent" /> Фото</button>
            <button onClick={() => { setAttachOpen(false); setPollOpen(true); }} className="w-full flex items-center gap-3 px-3 py-3.5 rounded-xl hover:bg-white/5 text-left"><BarChart3 size={22} className="text-accent" /> Опрос или викторина</button>
          </div>
        </Sheet>
      )}
      {pollOpen && <PollCreator onClose={() => setPollOpen(false)} onSend={sendPoll} />}
      {infoOpen && <ChatInfo uid={uid} chat={chat} accs={accs} onClose={() => setInfoOpen(false)} onLeft={() => { setInfoOpen(false); onBack(); }} />}

      {lightbox && (
        <div className="fixed inset-0 z-[400] bg-black/90 flex items-center justify-center p-3" onClick={() => setLightbox(null)}>
          <button className="absolute top-4 right-4 text-white/70" style={{ top: "calc(16px + env(safe-area-inset-top))" }}><X size={28} /></button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="" className="max-w-full max-h-full rounded-lg object-contain" />
        </div>
      )}
    </div>
  );
}
