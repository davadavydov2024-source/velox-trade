"use client";

import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Heart, ListMusic, Music2, Pause, Play, Repeat, Repeat1, Shuffle, SkipBack, SkipForward, X } from "lucide-react";
import { useToast } from "@/lib/toastContext";
import { mApi } from "./api";
import { gradientFor } from "./util";
import type { MusicRequest, MusicTrack } from "@/lib/messenger/music";

export type RepeatMode = "off" | "all" | "one";

type Ctl = {
  tracks: MusicTrack[];
  likes: Set<string>;
  requests: MusicRequest[];
  loaded: boolean;
  loading: boolean;
  ensureLoaded: () => void;
  reload: () => Promise<void>;
  current: MusicTrack | null;
  queue: MusicTrack[];
  index: number;
  playing: boolean;
  time: number;
  duration: number;
  shuffle: boolean;
  repeat: RepeatMode;
  expanded: boolean;
  pageOpen: boolean;
  setExpanded: (v: boolean) => void;
  setPageOpen: (v: boolean) => void;
  playQueue: (list: MusicTrack[], index: number) => void;
  toggle: () => void;
  next: () => void;
  prev: () => void;
  seek: (t: number) => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  toggleLike: (id: string) => void;
  stop: () => void;
};

const Ctx = createContext<Ctl | null>(null);
export function useMusic(): Ctl {
  const c = useContext(Ctx);
  if (!c) throw new Error("useMusic: нет MusicProvider");
  return c;
}

export const fmtTime = (s: number) => {
  if (!Number.isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
};

/** Обложка трека: картинка или градиент из названия + нота (когда обложки нет). */
export function TrackCover({ track, size = 48, radius = 10 }: { track: MusicTrack; size?: number | string; radius?: number }) {
  const [g1, g2] = gradientFor(track.id + track.title);
  return (
    <div className="relative shrink-0 overflow-hidden flex items-center justify-center" style={{ width: size, height: size, borderRadius: radius, background: `linear-gradient(135deg, ${g1}, ${g2})` }}>
      {track.coverUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={track.coverUrl} alt="" className="absolute inset-0 w-full h-full object-cover" draggable={false} loading="lazy" decoding="async" />
      ) : (
        <Music2 size={typeof size === "number" ? Math.round(size * 0.42) : 28} color="rgba(255,255,255,0.9)" />
      )}
    </div>
  );
}

/** Бегущие «эквалайзер-палочки» у играющего трека (как в VK Музыке). */
export function Equalizer({ active }: { active: boolean }) {
  return (
    <span className="mx-eq inline-flex items-end gap-[2px] h-4" aria-hidden>
      {[0, 1, 2].map((i) => <span key={i} className={active ? "on" : ""} style={{ animationDelay: `${i * 0.18}s` }} />)}
    </span>
  );
}

export function MusicProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [tracks, setTracks] = useState<MusicTrack[]>([]);
  const [likes, setLikes] = useState<Set<string>>(new Set());
  const [requests, setRequests] = useState<MusicRequest[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [queue, setQueue] = useState<MusicTrack[]>([]);
  const [index, setIndex] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<RepeatMode>("off");
  const [expanded, setExpanded] = useState(false);
  const [pageOpen, setPageOpen] = useState(false);

  const current = index >= 0 ? queue[index] ?? null : null;
  const st = useRef({ queue, index, shuffle, repeat, tracks });
  st.current = { queue, index, shuffle, repeat, tracks };
  const counted = useRef<string | null>(null);
  const acts = useRef<{ toggle: () => void; next: () => void; prev: () => void; seek: (t: number) => void }>({ toggle: () => {}, next: () => {}, prev: () => {}, seek: () => {} });

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const d = await mApi<{ tracks: MusicTrack[]; likes: string[]; requests: MusicRequest[] }>("music");
      setTracks(d.tracks);
      setLikes(new Set(d.likes));
      setRequests(d.requests);
      setLoaded(true);
    } catch {
      toast("error", "Не удалось загрузить музыку");
    } finally {
      setLoading(false);
    }
  }, [toast]);
  const ensureLoaded = useCallback(() => { if (!loaded && !loading) reload(); }, [loaded, loading, reload]);

  // следующий трек: auto=true — трек доиграл сам (учитываем «повтор»), false — нажали кнопку
  const goNext = useCallback((auto: boolean) => {
    const a = audioRef.current;
    const { queue: q, index: i, shuffle: sh, repeat: rp } = st.current;
    if (!a || q.length === 0) return;
    if (auto && rp === "one") { a.currentTime = 0; a.play().catch(() => {}); return; }
    let n: number;
    if (sh && q.length > 1) { do { n = Math.floor(Math.random() * q.length); } while (n === i); }
    else n = i + 1;
    if (n >= q.length) {
      if (rp === "all" || !auto) n = 0;
      else { a.pause(); a.currentTime = 0; setTime(0); return; }
    }
    if (q[n]?.id === q[i]?.id) { a.currentTime = 0; a.play().catch(() => {}); return; }
    setIndex(n);
  }, []);

  // один <audio> на всё приложение: музыка не прерывается при переходах между экранами
  useEffect(() => {
    const a = new Audio();
    a.preload = "auto";
    audioRef.current = a;
    const onTime = () => {
      setTime(a.currentTime);
      const cur = st.current.queue[st.current.index];
      if (cur && counted.current !== cur.id && a.currentTime > 10) {
        counted.current = cur.id;
        mApi("music", { action: "play", id: cur.id }).catch(() => {});
      }
    };
    const onMeta = () => { if (Number.isFinite(a.duration) && a.duration > 0) setDuration(a.duration); };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnd = () => goNext(true);
    const onErr = () => { setPlaying(false); toast("error", "Не удалось воспроизвести трек"); };
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("loadedmetadata", onMeta);
    a.addEventListener("durationchange", onMeta);
    a.addEventListener("play", onPlay);
    a.addEventListener("pause", onPause);
    a.addEventListener("ended", onEnd);
    a.addEventListener("error", onErr);
    const ms = (navigator as Navigator & { mediaSession?: MediaSession }).mediaSession;
    if (ms) {
      try {
        ms.setActionHandler("play", () => acts.current.toggle());
        ms.setActionHandler("pause", () => acts.current.toggle());
        ms.setActionHandler("previoustrack", () => acts.current.prev());
        ms.setActionHandler("nexttrack", () => acts.current.next());
        ms.setActionHandler("seekto", (d) => { if (typeof d.seekTime === "number") acts.current.seek(d.seekTime); });
      } catch {}
    }
    return () => {
      a.pause();
      a.removeAttribute("src");
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("loadedmetadata", onMeta);
      a.removeEventListener("durationchange", onMeta);
      a.removeEventListener("play", onPlay);
      a.removeEventListener("pause", onPause);
      a.removeEventListener("ended", onEnd);
      a.removeEventListener("error", onErr);
    };
  }, [goNext, toast]);

  // смена трека → грузим и играем + данные для экрана блокировки
  const curId = current?.id;
  useEffect(() => {
    const a = audioRef.current;
    if (!a || !current) return;
    counted.current = null;
    a.src = current.audioUrl;
    setTime(0);
    setDuration(current.duration ?? 0);
    a.play().catch(() => setPlaying(false));
    const ms = (navigator as Navigator & { mediaSession?: MediaSession }).mediaSession;
    if (ms && typeof MediaMetadata !== "undefined") {
      try { ms.metadata = new MediaMetadata({ title: current.title, artist: current.artist, artwork: current.coverUrl ? [{ src: current.coverUrl }] : [] }); } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curId]);

  const playQueue = useCallback((list: MusicTrack[], i: number) => {
    const t = list[i];
    if (!t) return;
    const cur = st.current.queue[st.current.index];
    setQueue(list);
    setIndex(i);
    if (cur?.id === t.id) audioRef.current?.play().catch(() => {});
  }, []);
  const toggle = useCallback(() => {
    const a = audioRef.current;
    if (!a || !st.current.queue.length) return;
    if (a.paused) a.play().catch(() => {}); else a.pause();
  }, []);
  const next = useCallback(() => goNext(false), [goNext]);
  const prev = useCallback(() => {
    const a = audioRef.current;
    const { queue: q, index: i } = st.current;
    if (!a || !q.length) return;
    if (a.currentTime > 3) { a.currentTime = 0; return; }
    setIndex(i <= 0 ? q.length - 1 : i - 1);
  }, []);
  const seek = useCallback((t: number) => {
    const a = audioRef.current;
    if (!a || !Number.isFinite(t)) return;
    a.currentTime = Math.max(0, t);
    setTime(a.currentTime);
  }, []);
  const stop = useCallback(() => {
    const a = audioRef.current;
    if (a) { a.pause(); a.removeAttribute("src"); a.load(); }
    setQueue([]); setIndex(-1); setPlaying(false); setTime(0); setDuration(0); setExpanded(false);
  }, []);
  acts.current = { toggle, next, prev, seek };

  const likesRef = useRef(likes);
  likesRef.current = likes;
  const toggleLike = useCallback((id: string) => {
    const has = likesRef.current.has(id);
    setLikes((prev) => { const n = new Set(prev); if (has) n.delete(id); else n.add(id); return n; });
    mApi("music", { action: has ? "unlike" : "like", id }).catch(() => {
      setLikes((prev) => { const n = new Set(prev); if (has) n.add(id); else n.delete(id); return n; });
      toast("error", "Не получилось");
    });
  }, [toast]);

  const value = useMemo<Ctl>(() => ({
    tracks, likes, requests, loaded, loading, ensureLoaded, reload, current, queue, index, playing, time, duration, shuffle, repeat, expanded, pageOpen,
    setExpanded, setPageOpen, playQueue, toggle, next, prev, seek, stop, toggleLike,
    toggleShuffle: () => setShuffle((v) => !v),
    cycleRepeat: () => setRepeat((r) => (r === "off" ? "all" : r === "all" ? "one" : "off")),
  }), [tracks, likes, requests, loaded, loading, ensureLoaded, reload, current, queue, index, playing, time, duration, shuffle, repeat, expanded, pageOpen, playQueue, toggle, next, prev, seek, stop, toggleLike]);

  return (
    <Ctx.Provider value={value}>
      {children}
      {expanded && current && <FullPlayer />}
    </Ctx.Provider>
  );
}

/** Мини-плеер над нижней панелью (как в Telegram/Spotify): виден, пока играет трек и открыт не экран «Музыка». */
export function MiniPlayer({ bottom }: { bottom: string }) {
  const m = useMusic();
  const t = m.current;
  if (!t || m.pageOpen || m.expanded) return null;
  const p = m.duration > 0 ? Math.min(1, m.time / m.duration) : 0;
  return (
    <div className="absolute left-3 right-3 z-[19] mx-glass rounded-2xl overflow-hidden mx-pop" style={{ bottom }}>
      <div className="flex items-center gap-3 pl-2 pr-1.5 py-2">
        <button className="flex items-center gap-3 flex-1 min-w-0 text-left" onClick={() => m.setExpanded(true)}>
          <TrackCover track={t} size={40} radius={8} />
          <span className="min-w-0 flex-1">
            <span className="block text-[14.5px] font-semibold truncate">{t.title}</span>
            <span className="block text-[12.5px] mx-muted truncate">{t.artist}</span>
          </span>
        </button>
        <button onClick={m.toggle} className="w-10 h-10 flex items-center justify-center rounded-full" aria-label={m.playing ? "Пауза" : "Играть"}>
          {m.playing ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" />}
        </button>
        <button onClick={m.next} className="w-9 h-10 flex items-center justify-center" aria-label="Следующий"><SkipForward size={20} fill="currentColor" /></button>
        <button onClick={m.stop} className="w-8 h-10 flex items-center justify-center mx-muted" aria-label="Закрыть"><X size={18} /></button>
      </div>
      <div className="h-[2px]" style={{ background: "var(--mx-line)" }}><div className="h-full" style={{ width: `${p * 100}%`, background: "var(--mx-accent)" }} /></div>
    </div>
  );
}

/** Волна как в SoundCloud: палочки по хэшу id (стабильно для трека); тап/протяжка — перемотка. */
function Waveform({ id, progress, onSeek }: { id: string; progress: number; onSeek: (ratio: number) => void }) {
  const BARS = 54;
  const bars = useMemo(() => {
    let h = 2166136261;
    for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
    const out: number[] = [];
    let prev = 0.5;
    for (let i = 0; i < BARS; i++) {
      h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
      const r = (h % 1000) / 1000;
      prev = Math.max(0.18, Math.min(1, prev * 0.45 + r * 0.7));
      out.push(prev);
    }
    return out;
  }, [id]);
  const [drag, setDrag] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const ratioFrom = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
  };
  const shown = drag ?? progress;
  return (
    <div
      ref={ref}
      className="flex items-center gap-[2px] h-14 w-full select-none cursor-pointer"
      style={{ touchAction: "none" }}
      onPointerDown={(e) => { (e.target as Element).setPointerCapture?.(e.pointerId); setDrag(ratioFrom(e)); }}
      onPointerMove={(e) => { if (drag !== null) setDrag(ratioFrom(e)); }}
      onPointerUp={(e) => { const r = ratioFrom(e); setDrag(null); onSeek(r); }}
      onPointerCancel={() => setDrag(null)}
    >
      {bars.map((h, i) => (
        <span key={i} className="flex-1 rounded-full" style={{ height: `${h * 100}%`, background: i / BARS < shown ? "var(--mx-accent)" : "color-mix(in srgb, var(--mx-text) 22%, transparent)", transition: drag === null ? "background 0.2s" : "none" }} />
      ))}
    </div>
  );
}

/** Полноэкранный плеер (как «Сейчас играет» в Spotify): большая обложка, волна, управление. */
function FullPlayer() {
  const m = useMusic();
  const t = m.current!;
  const [g1] = gradientFor(t.id + t.title);
  const liked = m.likes.has(t.id);
  const upNext = m.queue[(m.index + 1) % Math.max(1, m.queue.length)];
  const cover = Math.min(340, Math.round((typeof window !== "undefined" ? window.innerWidth : 400) * 0.78));
  return (
    <div className="fixed inset-0 z-[60] flex flex-col mx-fade" style={{ background: `linear-gradient(180deg, color-mix(in srgb, ${g1} 55%, var(--mx-bg)) 0%, var(--mx-bg) 78%)`, color: "var(--mx-text)" }}>
      <div className="mx-safe-top shrink-0">
        <div className="h-14 px-3 flex items-center justify-between">
          <button onClick={() => m.setExpanded(false)} className="w-10 h-10 flex items-center justify-center rounded-full" aria-label="Свернуть"><ChevronDown size={28} /></button>
          <span className="text-[13px] uppercase tracking-wider mx-muted">Сейчас играет</span>
          <span className="w-10" />
        </div>
      </div>
      <div className="flex-1 min-h-0 flex flex-col items-center px-6 pb-6 overflow-y-auto mx-scroll">
        <div className="mt-2 mb-6" style={{ width: cover, height: cover, boxShadow: "0 24px 60px rgba(0,0,0,0.45)", borderRadius: 18, transform: m.playing ? "scale(1)" : "scale(0.92)", transition: "transform 0.35s cubic-bezier(0.2,0.8,0.2,1)" }}>
          <TrackCover track={t} size={cover} radius={18} />
        </div>
        <div className="w-full max-w-[420px]">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[22px] font-bold leading-tight truncate">{t.title}</p>
              <p className="text-[16px] mx-muted truncate">{t.artist}</p>
            </div>
            <button onClick={() => m.toggleLike(t.id)} className="w-11 h-11 flex items-center justify-center rounded-full" aria-label="В любимые" style={{ color: liked ? "#ff2d55" : "var(--mx-muted)" }}>
              <Heart size={26} fill={liked ? "currentColor" : "none"} />
            </button>
          </div>
          <div className="mt-4">
            <Waveform id={t.id} progress={m.duration > 0 ? m.time / m.duration : 0} onSeek={(r) => m.seek(r * (m.duration || 0))} />
            <div className="flex justify-between text-[12.5px] mx-muted mt-1 tabular-nums"><span>{fmtTime(m.time)}</span><span>{fmtTime(m.duration)}</span></div>
          </div>
          <div className="flex items-center justify-between mt-3">
            <button onClick={m.toggleShuffle} className="w-11 h-11 flex items-center justify-center" style={{ color: m.shuffle ? "var(--mx-accent)" : "var(--mx-muted)" }} aria-label="Вперемешку"><Shuffle size={22} /></button>
            <button onClick={m.prev} className="w-12 h-12 flex items-center justify-center" aria-label="Предыдущий"><SkipBack size={28} fill="currentColor" /></button>
            <button onClick={m.toggle} className="w-[68px] h-[68px] rounded-full flex items-center justify-center active:scale-95 transition-transform" style={{ background: "var(--mx-text)", color: "var(--mx-bg)" }} aria-label={m.playing ? "Пауза" : "Играть"}>
              {m.playing ? <Pause size={30} fill="currentColor" /> : <Play size={30} fill="currentColor" style={{ marginLeft: 3 }} />}
            </button>
            <button onClick={m.next} className="w-12 h-12 flex items-center justify-center" aria-label="Следующий"><SkipForward size={28} fill="currentColor" /></button>
            <button onClick={m.cycleRepeat} className="w-11 h-11 flex items-center justify-center" style={{ color: m.repeat !== "off" ? "var(--mx-accent)" : "var(--mx-muted)" }} aria-label="Повтор">{m.repeat === "one" ? <Repeat1 size={22} /> : <Repeat size={22} />}</button>
          </div>
          {upNext && m.queue.length > 1 && (
            <div className="mt-6 mx-card px-3 py-2.5 flex items-center gap-3">
              <ListMusic size={18} className="mx-muted shrink-0" />
              <TrackCover track={upNext} size={34} radius={7} />
              <div className="min-w-0 flex-1"><p className="text-[11.5px] uppercase tracking-wide mx-muted">Далее</p><p className="text-[14px] truncate">{upNext.title} · <span className="mx-muted">{upNext.artist}</span></p></div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
