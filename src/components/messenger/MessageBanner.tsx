"use client";

import { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BarChart3, File as FileIcon, Gift, ImageIcon, Mic, Smile, Video, X } from "lucide-react";
import { useAdv } from "./advPrefs";
import { useAccounts } from "./hooks";
import { useMusic } from "./MusicPlayer";
import { Avatar } from "./ui";
import { chatPhoto, chatTitle, isChatMuted, isVideoUrl, peerUid, previewText } from "./util";
import type { MChat, MMsgKind, MUserChat } from "./mtypes";

/** Сколько висит шторка, если её не трогать. */
const SHOW_MS = 5500;
/** Первые секунды после загрузки списка чатов только запоминаем состояние (Firestore может сначала отдать кэш, потом свежие данные). */
const WARMUP_MS = 2500;

type Item = {
  chatId: string;
  from: string;
  kind: MMsgKind;
  text: string;
  at: number;
  /** сколько новых сообщений подряд пришло из этого чата, пока шторка висела */
  count: number;
};

const BANNER_CSS = `
@keyframes mx-banner-in { 0% { transform: translateY(-120%) scale(0.96); opacity: 0; } 60% { transform: translateY(4%) scale(1.005); opacity: 1; } 100% { transform: translateY(0) scale(1); opacity: 1; } }
@keyframes mx-banner-out { from { transform: translateY(0); opacity: 1; } to { transform: translateY(-120%); opacity: 0; } }
@keyframes mx-banner-bar { from { transform: scaleX(1); } to { transform: scaleX(0); } }
@keyframes mx-banner-ping { 0% { transform: scale(1); } 40% { transform: scale(1.04); } 100% { transform: scale(1); } }
.mx-banner-in { animation: mx-banner-in 0.46s cubic-bezier(0.2, 0.9, 0.25, 1) both; }
.mx-banner-out { animation: mx-banner-out 0.24s cubic-bezier(0.4, 0, 1, 1) both; }
.mx-banner-wrap { position: absolute; left: 0; right: 0; top: 0; z-index: 120; display: flex; justify-content: center; pointer-events: none; padding: calc(env(safe-area-inset-top) + 8px) 10px 0; }
@media (min-width: 900px) { .mx-banner-wrap { justify-content: flex-end; padding-right: 18px; padding-top: 14px; } }
.mx-banner {
  position: relative; display: flex; align-items: center; gap: 12px; padding: 10px 10px 12px 10px; overflow: hidden;
  border-radius: 26px; cursor: pointer; user-select: none; -webkit-user-select: none; touch-action: none;
  background: color-mix(in srgb, var(--mx-surface3, var(--mx-surface2)) 94%, transparent);
  -webkit-backdrop-filter: blur(24px) saturate(1.5); backdrop-filter: blur(24px) saturate(1.5);
  box-shadow: 0 18px 44px rgba(0, 0, 0, 0.34), 0 2px 10px rgba(0, 0, 0, 0.18), inset 0 0 0 1px color-mix(in srgb, var(--mx-text) 7%, transparent);
  transition: transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.2s, filter 0.15s;
  color: var(--mx-text);
}
.mx-banner.ping { animation: mx-banner-ping 0.3s ease-out; }
.mx-banner:active { filter: brightness(0.95); }
.mx-banner:focus-visible { outline: 2px solid var(--mx-accent); outline-offset: 2px; }
.mx-banner-bar { position: absolute; left: 14px; right: 14px; bottom: 4px; height: 3px; border-radius: 3px; background: var(--mx-accent); opacity: 0.55; transform-origin: left center; animation-name: mx-banner-bar; animation-timing-function: linear; animation-fill-mode: forwards; }
.mx-banner-x { opacity: 0; transition: opacity 0.15s; }
.mx-banner:hover .mx-banner-x, .mx-banner:focus-within .mx-banner-x { opacity: 1; }
@media (hover: none) { .mx-banner-x { display: none; } }
@media (prefers-reduced-motion: reduce) { .mx-banner-in, .mx-banner-out, .mx-banner.ping { animation-duration: 0.01s; } }
`;

/** Короткий текст для шторки + значок вида сообщения. */
function bannerPreview(kind: MMsgKind, text: string): { icon: ReactNode; label: string } {
  const t = text.replace(/\s+/g, " ").trim();
  switch (kind) {
    case "voice":
      return { icon: <Mic size={14} />, label: "Голосовое сообщение" };
    case "videoNote":
      return { icon: <Video size={14} />, label: "Видеосообщение" };
    case "image":
      return { icon: isVideoUrl(t) ? <Video size={14} /> : <ImageIcon size={14} />, label: previewText(kind, text) };
    case "file":
      return { icon: <FileIcon size={14} />, label: "Файл" };
    case "gift":
      return { icon: <Gift size={14} />, label: t ? `Подарок: ${t}` : "Подарок" };
    case "sticker":
      return { icon: <Smile size={14} />, label: t ? `${t} Стикер` : "Стикер" };
    case "poll":
      return { icon: <BarChart3 size={14} />, label: "Опрос" };
    case "giveaway":
      return { icon: <Gift size={14} />, label: "Розыгрыш" };
    default:
      return { icon: null, label: t };
  }
}

/**
 * Шторка «пришло сообщение», пока человек в приложении (как в Telegram): сверху выезжает карточка с именем и текстом,
 * нажатие открывает чат, свайп вверх/в сторону — убирает. Не показывается для открытого чата, заглушённых и архивных чатов,
 * своих сообщений и когда вкладка неактивна (тогда работает обычный пуш).
 */
export function MessageBanner({
  me,
  chats,
  userChats,
  loading,
  activeChatId,
  onOpen,
}: {
  me: string;
  chats: MChat[];
  userChats: Record<string, MUserChat>;
  loading: boolean;
  activeChatId: string | null;
  onOpen: (chatId: string) => void;
}) {
  const music = useMusic();
  const hidePreview = useAdv((s) => s.hideChatPreview);
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [item, setItem] = useState<Item | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [paused, setPaused] = useState(false);
  const [ping, setPing] = useState(0);

  useEffect(() => setTarget(document.getElementById("mx-root")), []);

  // свежие значения для эффекта слежения — чтобы он перезапускался только от новых данных чатов
  const live = useRef({ userChats, activeChatId, me });
  live.current = { userChats, activeChatId, me };
  const seen = useRef<Map<string, number> | null>(null);
  const baseMax = useRef(0);
  const warmUntil = useRef(0);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = useCallback(() => {
    setLeaving(true);
    if (leaveTimer.current) clearTimeout(leaveTimer.current);
    leaveTimer.current = setTimeout(() => {
      setItem(null);
      setLeaving(false);
    }, 230);
  }, []);

  // ---- слежение за новыми сообщениями ----
  useEffect(() => {
    if (loading) return;
    if (!seen.current) {
      seen.current = new Map(chats.map((c) => [c.id, c.lastMessage?.at ?? 0]));
      baseMax.current = chats.reduce((m, c) => Math.max(m, c.lastMessage?.at ?? 0), 0);
      warmUntil.current = Date.now() + WARMUP_MS;
      return;
    }
    const map = seen.current;
    const { userChats: ucs, activeChatId: active, me: myId } = live.current;
    const now = Date.now();
    const quiet = now < warmUntil.current || document.visibilityState !== "visible";
    let found: Item | null = null;

    for (const c of chats) {
      const last = c.lastMessage;
      const at = last?.at ?? 0;
      const prev = map.get(c.id);
      map.set(c.id, at);
      if (!last || quiet) continue;
      const isNew = prev === undefined ? at > baseMax.current : at > prev;
      if (!isNew) continue;
      if (last.from === myId || last.kind === "system") continue;
      if (active === c.id) continue;
      const uc = ucs[c.id];
      if (uc?.archived || isChatMuted(uc?.muted, uc?.mutedUntil, now)) continue;
      if (uc?.hiddenAt && at <= uc.hiddenAt) continue;
      if (!found || at > found.at) found = { chatId: c.id, from: last.from, kind: last.kind, text: last.text ?? "", at, count: 1 };
    }
    if (!found) return;

    if (leaveTimer.current) clearTimeout(leaveTimer.current);
    setLeaving(false);
    setPing((n) => n + 1);
    try { navigator.vibrate?.(10); } catch {}
    setItem((cur) => (cur && cur.chatId === found!.chatId ? { ...found!, count: cur.count + 1 } : found));
  }, [chats, loading]);

  // открыли этот чат (например, сами) — шторка больше не нужна
  useEffect(() => {
    if (item && activeChatId === item.chatId) dismiss();
  }, [activeChatId, item, dismiss]);

  // обычное скрытие делает полоска таймера (onAnimationEnd) — она ставится на паузу, пока палец/мышь на шторке;
  // этот таймер — страховка на случай, если анимация не сработала
  useEffect(() => {
    if (!item || leaving) return;
    const t = setTimeout(dismiss, SHOW_MS * 4);
    return () => clearTimeout(t);
  }, [item?.at, item?.chatId, leaving, dismiss]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { if (leaveTimer.current) clearTimeout(leaveTimer.current); }, []);

  // ---- жесты ----
  const cardRef = useRef<HTMLDivElement>(null);
  const g = useRef({ x: 0, y: 0, on: false, moved: false });
  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("[data-x]")) return;
    g.current = { x: e.clientX, y: e.clientY, on: true, moved: false };
    setPaused(true);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const s = g.current;
    const el = cardRef.current;
    if (!s.on || !el) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (!s.moved && Math.hypot(dx, dy) > 7) {
      s.moved = true;
      try { el.setPointerCapture(e.pointerId); } catch {}
    }
    if (!s.moved) return;
    el.style.transition = "none";
    if (Math.abs(dx) > Math.abs(dy)) {
      el.style.transform = `translateX(${dx}px)`;
      el.style.opacity = String(Math.max(0.25, 1 - Math.abs(dx) / 260));
    } else {
      el.style.transform = `translateY(${Math.min(0, dy)}px)`;
      el.style.opacity = String(Math.max(0.25, 1 + Math.min(0, dy) / 160));
    }
  };
  const endGesture = (e: React.PointerEvent) => {
    const s = g.current;
    const el = cardRef.current;
    if (!s.on) return;
    s.on = false;
    setPaused(false);
    if (!s.moved || !el) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    el.style.transition = "";
    if (dy < -34 || Math.abs(dx) > 90) {
      dismiss();
    } else {
      el.style.transform = "";
      el.style.opacity = "";
    }
  };
  const open = () => {
    if (g.current.moved || !item) return;
    const id = item.chatId;
    dismiss();
    music.setExpanded(false);
    onOpen(id);
  };

  // ---- данные для отображения ----
  const chat = item ? chats.find((c) => c.id === item.chatId) ?? null : null;
  const ids = item && chat ? [chat.type === "dm" ? peerUid(chat, me) : "", item.from].filter(Boolean) : [];
  const accounts = useAccounts(ids);

  if (!target || !item || !chat) return null;

  const title = chatTitle(chat, me, accounts);
  const senderName = chat.type !== "dm" ? accounts[item.from]?.displayName?.split(" ")[0] : "";
  const pv = hidePreview ? { icon: null, label: "Новое сообщение" } : bannerPreview(item.kind, item.text);
  const body = senderName && !hidePreview ? (pv.label ? `${senderName}: ${pv.label}` : senderName) : pv.label;

  return createPortal(
    <div className="mx-banner-wrap">
      <style>{BANNER_CSS}</style>
      <div key={item.chatId} className={leaving ? "mx-banner-out" : "mx-banner-in"} style={{ width: "100%", maxWidth: 420, pointerEvents: "auto" }}>
        <div
          ref={cardRef}
          key={ping}
          className={`mx-banner${ping > 1 ? " ping" : ""}`}
          role="button"
          tabIndex={0}
          aria-live="polite"
          aria-label={`Новое сообщение от ${title}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endGesture}
          onPointerCancel={endGesture}
          onPointerEnter={(e) => { if (e.pointerType === "mouse") setPaused(true); }}
          onPointerLeave={(e) => { if (e.pointerType === "mouse" && !g.current.on) setPaused(false); }}
          onClick={open}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") { e.preventDefault(); g.current.moved = false; open(); }
            else if (e.key === "Escape") dismiss();
          }}
        >
          <div className="relative shrink-0">
            <Avatar src={chatPhoto(chat, me, accounts)} name={title} seed={chat.type === "dm" ? peerUid(chat, me) : chat.id} size={48} />
            {item.count > 1 && (
              <span className="mx-badge absolute" style={{ right: -6, top: -6, border: "2px solid var(--mx-surface3, var(--mx-surface2))" }} aria-label={`Новых сообщений: ${item.count}`}>{item.count > 99 ? "99+" : item.count}</span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-[15.5px] font-semibold truncate">{title}</span>
              <span className="text-[11.5px] shrink-0 ml-auto" style={{ color: "var(--mx-accent)" }}>сейчас</span>
            </div>
            <div className="flex items-start gap-1.5 text-[14px] leading-[1.3]" style={{ color: "color-mix(in srgb, var(--mx-text) 80%, transparent)" }}>
              {pv.icon && <span className="shrink-0 mt-[3px]" style={{ color: "var(--mx-accent)" }}>{pv.icon}</span>}
              <span style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", wordBreak: "break-word" }}>{body}</span>
            </div>
          </div>
          <button
            data-x
            type="button"
            onClick={(e) => { e.stopPropagation(); dismiss(); }}
            className="mx-banner-x w-7 h-7 rounded-full flex items-center justify-center shrink-0 mx-muted"
            aria-label="Скрыть"
          >
            <X size={16} />
          </button>
          <span
            key={`${item.chatId}:${item.at}`}
            className="mx-banner-bar"
            style={{ animationDuration: `${SHOW_MS}ms`, animationPlayState: paused ? "paused" : "running" }}
            onAnimationEnd={() => { if (!leaving) dismiss(); }}
          />
        </div>
      </div>
    </div>,
    target
  );
}
