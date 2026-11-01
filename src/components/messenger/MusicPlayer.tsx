"use client";

import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Heart, ListMusic, Loader2, Music2, Pause, Play, Repeat, Repeat1, Shuffle, SkipBack, SkipForward, Volume2, VolumeX, X } from "lucide-react";
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
  buffering: boolean;
  /** Человеческий статус загрузки: «Загрузка 42%», «Слабый интернет…» или пусто */
  status: string;
  duration: number;
  shuffle: boolean;
  repeat: RepeatMode;
  volume: number;
  expanded: boolean;
  pageOpen: boolean;
  setVolume: (v: number) => void;
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

// время — в отдельном контексте: оно меняется ~4 раза в секунду, и перерисовываться должны только полосы прогресса, а не весь список треков
const Ctx = createContext<Ctl | null>(null);
const TimeCtx = createContext<{ time: number; buffered: number }>({ time: 0, buffered: 0 });

export function useMusic(): Ctl {
  const c = useContext(Ctx);
  if (!c) throw new Error("useMusic: нет MusicProvider");
  return c;
}
export const useMusicTime = () => useContext(TimeCtx);

export const fmtTime = (s: number) => {
  if (!Number.isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
};

const MUSIC_CSS = `
@keyframes mx-heart-pop { 0% { transform: scale(1); } 35% { transform: scale(1.35); } 100% { transform: scale(1); } }
.mx-heart-pop { animation: mx-heart-pop 0.32s cubic-bezier(0.2, 0.8, 0.2, 1); }
@keyframes mx-marq { 0%, 18% { transform: translateX(0); } 82%, 100% { transform: translateX(var(--mq)); } }
@keyframes mx-music-up { from { transform: translateY(100%); } to { transform: translateY(0); } }
.mx-music-up { animation: mx-music-up 0.28s cubic-bezier(0.2, 0.8, 0.2, 1); }
.mx-vol { -webkit-appearance: none; appearance: none; height: 4px; border-radius: 2px; outline: none; background: color-mix(in srgb, var(--mx-text) 25%, transparent); }
.mx-vol::-webkit-slider-thumb { -webkit-appearance: none; width: 14px; height: 14px; border-radius: 50%; background: var(--mx-text); }
.mx-vol::-moz-range-thumb { width: 14px; height: 14px; border: 0; border-radius: 50%; background: var(--mx-text); }
`;

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

const isTyping = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
};

export function MusicProvider({ children }: { children: ReactNode }) {
  const { toast: toastFn } = useToast();
  const toastRef = useRef(toastFn);
  toastRef.current = toastFn;
  const toast = useCallback((k: "success" | "error" | "info", m: string) => toastRef.current(k, m), []);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [tracks, setTracks] = useState<MusicTrack[]>([]);
  const [likes, setLikes] = useState<Set<string>>(new Set());
  const [requests, setRequests] = useState<MusicRequest[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [queue, setQueue] = useState<MusicTrack[]>([]);
  const [index, setIndex] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [loadPct, setLoadPct] = useState<number | null>(null);
  const [slow, setSlow] = useState(false);
  const [time, setTime] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [duration, setDuration] = useState(0);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<RepeatMode>("off");
  const [volume, setVolumeState] = useState(1);
  const [expanded, setExpanded] = useState(false);
  const [pageOpen, setPageOpen] = useState(false);

  const current = index >= 0 ? queue[index] ?? null : null;
  const st = useRef({ queue, index, shuffle, repeat });
  st.current = { queue, index, shuffle, repeat };
  const flags = useRef({ pageOpen, expanded });
  flags.current = { pageOpen, expanded };
  const live = useRef({ playing, buffering });
  live.current = { playing, buffering };
  const counted = useRef<string | null>(null);
  const lastPos = useRef(0);
  const wd = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fb = useRef<{ id: string | null; obj: string | null }>({ id: null, obj: null });
  const tryFb = useRef<(t: MusicTrack) => Promise<boolean>>(async () => false);
  const goNextRef = useRef<(auto: boolean) => void>(() => {});
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

  // play() с понятной реакцией на отказ браузера (Safari/iOS требуют запуск из нажатия)
  const safePlay = useCallback((a: HTMLAudioElement) => {
    const p = a.play();
    if (p && typeof p.catch === "function") {
      p.catch((err: any) => {
        if (err?.name === "AbortError") return; // трек сменили во время загрузки — это нормально
        setPlaying(false);
        setBuffering(false);
        toast("error", err?.name === "NotAllowedError" ? "Браузер не дал включить звук — нажми ▶ ещё раз" : "Не удалось включить трек");
      });
    }
  }, [toast]);

  // запасной путь: если потоковое воспроизведение не стартует, скачиваем файл целиком (с процентами) и играем из памяти
  const tryFallback = useCallback(async (t: MusicTrack): Promise<boolean> => {
    const a = audioRef.current;
    if (!a || fb.current.id === t.id) return false;
    fb.current.id = t.id;
    setBuffering(true);
    setLoadPct(0);
    const ac = new AbortController();
    const killer = setTimeout(() => ac.abort(), 90_000);
    try {
      const res = await fetch(t.audioUrl, { signal: ac.signal });
      if (!res.ok) throw new Error(`сервер ответил ${res.status}`);
      const total = Number(res.headers.get("content-length")) || 0;
      let blob: Blob;
      if (res.body && total) {
        const reader = res.body.getReader();
        const chunks: Uint8Array[] = [];
        let got = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) { chunks.push(value); got += value.length; setLoadPct(Math.min(0.99, got / total)); }
          if (st.current.queue[st.current.index]?.id !== t.id) { reader.cancel().catch(() => {}); return true; } // трек сменили
        }
        blob = new Blob(chunks as unknown as BlobPart[], { type: res.headers.get("content-type") || "audio/mpeg" });
      } else {
        blob = await res.blob();
      }
      setLoadPct(null);
      if (st.current.queue[st.current.index]?.id !== t.id) return true;
      if (fb.current.obj) URL.revokeObjectURL(fb.current.obj);
      const typed = blob.type && blob.type.startsWith("audio/") ? blob : new Blob([blob], { type: "audio/mpeg" });
      fb.current.obj = URL.createObjectURL(typed);
      a.src = fb.current.obj;
      safePlay(a);
      setTimeout(() => {
        if (!live.current.playing && st.current.queue[st.current.index]?.id === t.id) {
          setBuffering(false);
          toast("error", "Файл скачан, но браузер не может его проиграть — проверь, что это настоящий mp3");
        }
      }, 8000);
      return true;
    } catch (e: any) {
      setLoadPct(null);
      setBuffering(false);
      toast("error", e?.name === "AbortError" ? "Трек грузится слишком долго — проверь интернет" : `Не удалось загрузить файл (${e?.message ?? "сеть"})`);
      return false;
    } finally {
      clearTimeout(killer);
    }
  }, [safePlay, toast]);
  tryFb.current = tryFallback;

  // загрузить трек в плеер и сразу играть + данные для экрана блокировки
  const startTrack = useCallback((a: HTMLAudioElement, t: MusicTrack) => {
    counted.current = null;
    lastPos.current = 0;
    fb.current.id = null;
    if (a.src !== t.audioUrl) a.src = t.audioUrl;
    setTime(0);
    setBuffered(0);
    setDuration(t.duration ?? 0);
    setBuffering(true);
    safePlay(a);
    // сторож: проверяем каждые 6 секунд. Данные идут (медленный интернет) — ждём и показываем «Слабый интернет»;
    // данных нет совсем или прогресса нет — включаем запасной путь (скачивание целиком с процентами)
    if (wd.current) clearTimeout(wd.current);
    setSlow(false);
    let lastBuf = -1;
    let round = 0;
    const check = () => {
      const a2 = audioRef.current;
      const cur = st.current.queue[st.current.index];
      if (!a2 || !cur || cur.id !== t.id) return;
      if (a2.readyState >= 3 && !a2.paused) return;
      if (live.current.playing && !live.current.buffering) return;
      const b = a2.buffered;
      const end = b.length ? b.end(b.length - 1) : 0;
      round++;
      if (end > lastBuf && end > 0 && round < 5) { lastBuf = end; setSlow(true); wd.current = setTimeout(check, 6000); return; }
      setSlow(false);
      tryFb.current(cur);
    };
    wd.current = setTimeout(check, 6000);
    const ms = (navigator as Navigator & { mediaSession?: MediaSession }).mediaSession;
    if (ms && typeof MediaMetadata !== "undefined") {
      try { ms.metadata = new MediaMetadata({ title: t.title, artist: t.artist, artwork: t.coverUrl ? [{ src: t.coverUrl }] : [] }); } catch {}
    }
  }, [safePlay]);

  // следующий трек: auto=true — трек доиграл сам (учитываем «повтор»), false — нажали кнопку
  const goNext = useCallback((auto: boolean) => {
    const a = audioRef.current;
    const { queue: q, index: i, shuffle: sh, repeat: rp } = st.current;
    if (!a || q.length === 0) return;
    if (auto && rp === "one") { a.currentTime = 0; safePlay(a); return; }
    let n: number;
    if (sh && q.length > 1) { do { n = Math.floor(Math.random() * q.length); } while (n === i); }
    else n = i + 1;
    if (n >= q.length) {
      if (rp === "all" || !auto) n = 0;
      else { a.pause(); a.currentTime = 0; setTime(0); return; }
    }
    if (q[n]?.id === q[i]?.id) { a.currentTime = 0; safePlay(a); return; }
    setIndex(n);
  }, [safePlay]);
  goNextRef.current = goNext;

  // один <audio> на всё приложение: музыка не прерывается при переходах между экранами
  useEffect(() => {
    const a = new Audio();
    a.preload = "auto";
    try { const v = parseFloat(localStorage.getItem("mx-music-vol") ?? ""); if (Number.isFinite(v)) { a.volume = Math.max(0, Math.min(1, v)); setVolumeState(a.volume); } } catch {}
    audioRef.current = a;
    const bufEnd = () => {
      const b = a.buffered;
      for (let i = 0; i < b.length; i++) if (a.currentTime >= b.start(i) - 0.5 && a.currentTime <= b.end(i) + 0.5) return b.end(i);
      return 0;
    };
    const ms = (navigator as Navigator & { mediaSession?: MediaSession }).mediaSession;
    const onTime = () => {
      setTime(a.currentTime);
      const cur = st.current.queue[st.current.index];
      if (cur && counted.current !== cur.id && a.currentTime > 10) {
        counted.current = cur.id;
        mApi("music", { action: "play", id: cur.id }).catch(() => {});
      }
      // позиция на экране блокировки — раз в секунду
      if (ms && Math.abs(a.currentTime - lastPos.current) >= 1 && Number.isFinite(a.duration) && a.duration > 0) {
        lastPos.current = a.currentTime;
        try { ms.setPositionState?.({ duration: a.duration, position: Math.min(a.currentTime, a.duration), playbackRate: a.playbackRate || 1 }); } catch {}
      }
    };
    const onProgress = () => setBuffered(bufEnd());
    const onMeta = () => { if (Number.isFinite(a.duration) && a.duration > 0) setDuration(a.duration); };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onWait = () => setBuffering(true);
    const onReady = () => setBuffering(false);
    const onEnd = () => goNextRef.current(true);
    const onErr = () => {
      if (!a.getAttribute("src")) return; // сброс плеера (stop) — не ошибка
      const cur = st.current.queue[st.current.index];
      if (cur && fb.current.id !== cur.id && !a.src.startsWith("blob:")) { tryFb.current(cur); return; } // сначала пробуем запасной путь
      setPlaying(false);
      setBuffering(false);
      const code = a.error?.code;
      toast("error", code === 4 ? "Файл не открывается: проверь, что это mp3 и ссылка рабочая" : code === 2 ? "Проблема с сетью — не удалось загрузить трек" : "Не удалось воспроизвести трек");
    };
    const evs: [string, () => void][] = [["timeupdate", onTime], ["progress", onProgress], ["loadedmetadata", onMeta], ["durationchange", onMeta], ["play", onPlay], ["pause", onPause], ["waiting", onWait], ["loadstart", onWait], ["playing", onReady], ["canplay", onReady], ["seeked", onReady], ["ended", onEnd], ["error", onErr]];
    evs.forEach(([n, f]) => a.addEventListener(n, f));
    if (ms) {
      try {
        ms.setActionHandler("play", () => acts.current.toggle());
        ms.setActionHandler("pause", () => acts.current.toggle());
        ms.setActionHandler("previoustrack", () => acts.current.prev());
        ms.setActionHandler("nexttrack", () => acts.current.next());
        ms.setActionHandler("seekto", (d) => { if (typeof d.seekTime === "number") acts.current.seek(d.seekTime); });
        ms.setActionHandler("seekbackward", () => acts.current.seek(a.currentTime - 10));
        ms.setActionHandler("seekforward", () => acts.current.seek(a.currentTime + 10));
      } catch {}
    }
    return () => {
      evs.forEach(([n, f]) => a.removeEventListener(n, f));
      a.pause();
      a.removeAttribute("src");
    };
  }, [toast]);

  // горячие клавиши (компьютер): пробел — пауза, ←/→ — перемотка на 5 секунд; только когда открыт раздел «Музыка» или плеер
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(flags.current.pageOpen || flags.current.expanded) || isTyping(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      const a = audioRef.current;
      if (!a || !st.current.queue.length) return;
      if (e.code === "Space") { e.preventDefault(); acts.current.toggle(); }
      else if (e.code === "ArrowRight") { e.preventDefault(); acts.current.seek(a.currentTime + 5); }
      else if (e.code === "ArrowLeft") { e.preventDefault(); acts.current.seek(a.currentTime - 5); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // смена трека кнопками «дальше/назад» и автопереход: плеер уже «разбужен» нажатием, поэтому можно из эффекта
  const curId = current?.id;
  useEffect(() => {
    const a = audioRef.current;
    if (!a || !current) return;
    if (a.src === current.audioUrl || (fb.current.id === current.id && a.src.startsWith("blob:"))) return; // этот трек уже загружен (запущен из клика)
    startTrack(a, current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curId]);

  // тап по треку: src и play() выставляются прямо в обработчике клика — так iOS/Safari разрешают звук
  const playQueue = useCallback((list: MusicTrack[], i: number) => {
    const t = list[i];
    const a = audioRef.current;
    if (!t || !a) return;
    const cur = st.current.queue[st.current.index];
    setQueue(list);
    setIndex(i);
    if (cur?.id === t.id) safePlay(a);
    else startTrack(a, t);
  }, [safePlay, startTrack]);
  const toggle = useCallback(() => {
    const a = audioRef.current;
    if (!a || !st.current.queue.length) return;
    if (a.paused) safePlay(a); else a.pause();
  }, [safePlay]);
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
    const max = Number.isFinite(a.duration) && a.duration > 0 ? a.duration - 0.2 : t;
    a.currentTime = Math.max(0, Math.min(t, max));
    setTime(a.currentTime);
  }, []);
  const stop = useCallback(() => {
    const a = audioRef.current;
    if (wd.current) clearTimeout(wd.current);
    if (a) { a.pause(); a.removeAttribute("src"); }
    if (fb.current.obj) { URL.revokeObjectURL(fb.current.obj); fb.current.obj = null; }
    setQueue([]); setIndex(-1); setPlaying(false); setBuffering(false); setTime(0); setDuration(0); setExpanded(false);
  }, []);
  const setVolume = useCallback((v: number) => {
    const a = audioRef.current;
    const x = Math.max(0, Math.min(1, v));
    if (a) a.volume = x;
    setVolumeState(x);
    try { localStorage.setItem("mx-music-vol", String(x)); } catch {}
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
    tracks, likes, requests, loaded, loading, ensureLoaded, reload, current, queue, index, playing, buffering, status, duration, shuffle, repeat, volume, expanded, pageOpen,
    setVolume, setExpanded, setPageOpen, playQueue, toggle, next, prev, seek, stop, toggleLike,
    toggleShuffle: () => setShuffle((v) => !v),
    cycleRepeat: () => setRepeat((r) => (r === "off" ? "all" : r === "all" ? "one" : "off")),
  }), [tracks, likes, requests, loaded, loading, ensureLoaded, reload, current, queue, index, playing, buffering, status, duration, shuffle, repeat, volume, expanded, pageOpen, setVolume, playQueue, toggle, next, prev, seek, stop, toggleLike]);
  const timeVal = useMemo(() => ({ time, buffered }), [time, buffered]);
  const status = loadPct !== null ? `Загрузка ${Math.round(loadPct * 100)}%` : buffering && slow ? "Слабый интернет — идёт загрузка…" : buffering && !playing ? "Загрузка…" : "";

  return (
    <Ctx.Provider value={value}>
      <TimeCtx.Provider value={timeVal}>
        <style>{MUSIC_CSS}</style>
        {children}
        {expanded && current && <FullPlayer />}
      </TimeCtx.Provider>
    </Ctx.Provider>
  );
}

/** Кнопка play/pause: во время буферизации крутится индикатор. */
function PlayGlyph({ playing, buffering, size, offset = 0 }: { playing: boolean; buffering: boolean; size: number; offset?: number }) {
  if (buffering) return <Loader2 size={size} className="animate-spin" />;
  return playing ? <Pause size={size} fill="currentColor" /> : <Play size={size} fill="currentColor" style={{ marginLeft: offset }} />;
}

/** Мини-плеер над нижней панелью (как в Telegram/Spotify): виден на любом экране, пока в очереди есть трек. */
export function MiniPlayer({ bottom }: { bottom: string }) {
  const m = useMusic();
  const { time } = useMusicTime();
  const t = m.current;
  if (!t || m.expanded) return null;
  const p = m.duration > 0 ? Math.min(1, time / m.duration) : 0;
  return (
    <div className="absolute left-3 right-3 z-[19] mx-glass rounded-2xl overflow-hidden mx-pop" style={{ bottom, boxShadow: "0 8px 28px rgba(0,0,0,0.28)" }}>
      <div className="flex items-center gap-2 pl-2 pr-1 py-2">
        <button className="flex items-center gap-3 flex-1 min-w-0 text-left" onClick={() => m.setExpanded(true)} aria-label="Открыть плеер">
          <div className="relative">
            <TrackCover track={t} size={42} radius={9} />
            {m.playing && !m.buffering && <span className="absolute inset-0 rounded-[9px] flex items-end justify-center pb-1" style={{ background: "rgba(0,0,0,0.28)" }}><Equalizer active /></span>}
          </div>
          <span className="min-w-0 flex-1">
            <span className="block text-[14.5px] font-semibold truncate">{t.title}</span>
            <span className="block text-[12.5px] mx-muted truncate" style={m.status ? { color: "var(--mx-accent)" } : undefined}>{m.status || t.artist}</span>
          </span>
        </button>
        <button onClick={m.toggle} className="w-10 h-10 flex items-center justify-center rounded-full active:scale-90 transition-transform" aria-label={m.playing ? "Пауза" : "Играть"}>
          <PlayGlyph playing={m.playing} buffering={m.buffering} size={22} />
        </button>
        <button onClick={m.next} className="w-9 h-10 flex items-center justify-center active:scale-90 transition-transform" aria-label="Следующий"><SkipForward size={20} fill="currentColor" /></button>
        <button onClick={m.stop} className="w-8 h-10 flex items-center justify-center mx-muted" aria-label="Закрыть"><X size={18} /></button>
      </div>
      <div className="h-[3px]" style={{ background: "var(--mx-line)" }}><div className="h-full" style={{ width: `${p * 100}%`, background: "var(--mx-accent)", transition: "width 0.25s linear" }} /></div>
    </div>
  );
}

/** Название, которое не влезает, плавно «ездит» туда-обратно (как в Spotify). */
function Marquee({ text, className }: { text: string; className?: string }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLSpanElement>(null);
  const [shift, setShift] = useState(0);
  useEffect(() => {
    const o = outer.current;
    const i = inner.current;
    if (!o || !i) return;
    const d = i.scrollWidth - o.clientWidth;
    setShift(d > 4 ? d + 8 : 0);
  }, [text]);
  return (
    <div ref={outer} className={`overflow-hidden whitespace-nowrap ${className ?? ""}`}>
      <span ref={inner} className="inline-block" style={shift ? ({ animation: `mx-marq ${Math.max(6, shift / 16)}s ease-in-out infinite alternate`, "--mq": `-${shift}px` } as React.CSSProperties) : undefined}>{text}</span>
    </div>
  );
}

/** Волна как в SoundCloud: палочки по хэшу id (стабильно для трека); тап/протяжка — перемотка; светлее — что уже загружено. */
function Waveform({ id, progress, buffered, onSeek, onDrag }: { id: string; progress: number; buffered: number; onSeek: (ratio: number) => void; onDrag?: (ratio: number | null) => void }) {
  const BARS = 56;
  const bars = useMemo(() => {
    let h = 2166136261;
    for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
    const out: number[] = [];
    let prev = 0.5;
    for (let i = 0; i < BARS; i++) {
      h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
      const r = (h % 1000) / 1000;
      prev = Math.max(0.2, Math.min(1, prev * 0.45 + r * 0.7));
      out.push(prev);
    }
    return out;
  }, [id]);
  const [drag, setDrag] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { onDrag?.(drag); }, [drag, onDrag]);
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
      onPointerDown={(e) => { ref.current?.setPointerCapture?.(e.pointerId); setDrag(ratioFrom(e)); }}
      onPointerMove={(e) => { if (drag !== null) setDrag(ratioFrom(e)); }}
      onPointerUp={(e) => { const r = ratioFrom(e); setDrag(null); onSeek(r); }}
      onPointerCancel={() => setDrag(null)}
      role="slider"
      aria-label="Перемотка"
    >
      {bars.map((h, i) => {
        const pos = i / BARS;
        const played = pos < shown;
        const loadedBar = pos < buffered;
        return (
          <span key={i} className="flex-1 rounded-full" style={{ height: `${h * 100}%`, transform: drag !== null && Math.abs(pos - shown) < 0.03 ? "scaleY(1.12)" : undefined, background: played ? "var(--mx-accent)" : `color-mix(in srgb, var(--mx-text) ${loadedBar ? 30 : 16}%, transparent)`, transition: drag === null ? "background 0.2s" : "none" }} />
        );
      })}
    </div>
  );
}

/** Полноэкранный плеер (как «Сейчас играет» в Spotify): размытая обложка, большая обложка, волна, очередь, закрытие свайпом вниз. */
function FullPlayer() {
  const m = useMusic();
  const { time, buffered } = useMusicTime();
  const t = m.current!;
  const [g1] = gradientFor(t.id + t.title);
  const liked = m.likes.has(t.id);
  const upNext = m.queue.length > 1 ? m.queue[(m.index + 1) % m.queue.length] : null;
  const cover = Math.min(340, Math.round((typeof window !== "undefined" ? Math.min(window.innerWidth, window.innerHeight * 0.5) : 400) * 0.82));
  const [dragR, setDragR] = useState<number | null>(null);
  const [showQueue, setShowQueue] = useState(false);
  const shownTime = dragR !== null ? dragR * m.duration : time;

  // закрытие свайпом вниз по шапке и обложке
  const rootRef = useRef<HTMLDivElement>(null);
  const sw = useRef({ y: 0, dy: 0, on: false });
  const onTS = (e: React.TouchEvent) => { sw.current = { y: e.touches[0].clientY, dy: 0, on: true }; };
  const onTM = (e: React.TouchEvent) => {
    if (!sw.current.on) return;
    const dy = Math.max(0, e.touches[0].clientY - sw.current.y);
    sw.current.dy = dy;
    const el = rootRef.current;
    if (el) { el.style.transition = "none"; el.style.transform = `translateY(${dy}px)`; el.style.opacity = String(1 - Math.min(0.5, dy / 600)); }
  };
  const onTE = () => {
    const el = rootRef.current;
    const dy = sw.current.dy;
    sw.current.on = false;
    if (dy > 130) { m.setExpanded(false); return; }
    if (el) { el.style.transition = "transform 0.2s, opacity 0.2s"; el.style.transform = ""; el.style.opacity = ""; }
  };

  return (
    <div ref={rootRef} className="fixed inset-0 z-[60] flex flex-col mx-fade overflow-hidden" style={{ background: "var(--mx-bg)", color: "var(--mx-text)" }}>
      {/* фон: размытая обложка (или градиент) + затемнение вниз */}
      <div className="absolute inset-0 pointer-events-none" style={{ background: `linear-gradient(180deg, color-mix(in srgb, ${g1} 60%, var(--mx-bg)) 0%, var(--mx-bg) 80%)` }} />
      {t.coverUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={t.coverUrl} alt="" aria-hidden className="absolute pointer-events-none" draggable={false} style={{ top: "-10%", left: "-20%", width: "140%", height: "70%", objectFit: "cover", filter: "blur(60px) saturate(1.5)", opacity: 0.55 }} />
      )}
      <div className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(180deg, transparent 20%, var(--mx-bg) 78%)" }} />

      <div className="relative flex flex-col flex-1 min-h-0">
        <div onTouchStart={onTS} onTouchMove={onTM} onTouchEnd={onTE} onTouchCancel={onTE}>
          <div className="mx-safe-top shrink-0">
            <div className="h-14 px-3 flex items-center justify-between">
              <button onClick={() => m.setExpanded(false)} className="w-10 h-10 flex items-center justify-center rounded-full active:bg-white/10" aria-label="Свернуть"><ChevronDown size={28} /></button>
              <span className="text-[12.5px] uppercase tracking-[0.14em] mx-muted">Сейчас играет</span>
              <button onClick={() => setShowQueue(true)} className="w-10 h-10 flex items-center justify-center rounded-full active:bg-white/10" aria-label="Очередь"><ListMusic size={22} /></button>
            </div>
          </div>
          <div className="flex justify-center pt-2 pb-6">
            <div style={{ width: cover, height: cover, boxShadow: "0 24px 60px rgba(0,0,0,0.5)", borderRadius: 20, transform: m.playing ? "scale(1)" : "scale(0.9)", transition: "transform 0.4s cubic-bezier(0.2,0.8,0.2,1)" }}>
              <TrackCover track={t} size={cover} radius={20} />
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto mx-scroll px-6 pb-6">
          <div className="w-full max-w-[420px] mx-auto">
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <Marquee text={t.title} className="text-[22px] font-bold leading-tight" />
                <p className="text-[16px] mx-muted truncate" style={m.status ? { color: "var(--mx-accent)" } : undefined}>{m.status || t.artist}</p>
              </div>
              <button key={String(liked)} onClick={() => m.toggleLike(t.id)} className={`w-11 h-11 flex items-center justify-center rounded-full ${liked ? "mx-heart-pop" : ""}`} aria-label="В любимые" style={{ color: liked ? "#ff2d55" : "var(--mx-muted)" }}>
                <Heart size={26} fill={liked ? "currentColor" : "none"} />
              </button>
            </div>

            <div className="mt-4">
              <Waveform id={t.id} progress={m.duration > 0 ? time / m.duration : 0} buffered={m.duration > 0 ? buffered / m.duration : 0} onSeek={(r) => { if (m.duration > 0) m.seek(r * m.duration); }} onDrag={setDragR} />
              <div className="flex justify-between text-[12.5px] mx-muted mt-1 tabular-nums"><span style={{ color: dragR !== null ? "var(--mx-text)" : undefined }}>{fmtTime(shownTime)}</span><span>{m.duration > 0 ? `−${fmtTime(Math.max(0, m.duration - shownTime))}` : "--:--"}</span></div>
            </div>

            <div className="flex items-center justify-between mt-2">
              <button onClick={m.toggleShuffle} className="w-11 h-11 flex items-center justify-center" style={{ color: m.shuffle ? "var(--mx-accent)" : "var(--mx-muted)" }} aria-label="Вперемешку"><Shuffle size={22} /></button>
              <button onClick={m.prev} className="w-12 h-12 flex items-center justify-center active:scale-90 transition-transform" aria-label="Предыдущий"><SkipBack size={28} fill="currentColor" /></button>
              <button onClick={m.toggle} className="w-[70px] h-[70px] rounded-full flex items-center justify-center active:scale-95 transition-transform" style={{ background: "var(--mx-text)", color: "var(--mx-bg)", boxShadow: "0 10px 30px color-mix(in srgb, var(--mx-accent) 45%, transparent)" }} aria-label={m.playing ? "Пауза" : "Играть"}>
                <PlayGlyph playing={m.playing} buffering={m.buffering} size={30} offset={3} />
              </button>
              <button onClick={m.next} className="w-12 h-12 flex items-center justify-center active:scale-90 transition-transform" aria-label="Следующий"><SkipForward size={28} fill="currentColor" /></button>
              <button onClick={m.cycleRepeat} className="w-11 h-11 flex items-center justify-center" style={{ color: m.repeat !== "off" ? "var(--mx-accent)" : "var(--mx-muted)" }} aria-label="Повтор">{m.repeat === "one" ? <Repeat1 size={22} /> : <Repeat size={22} />}</button>
            </div>

            {/* громкость — на компьютере (на телефоне есть кнопки громкости) */}
            <div className="hidden md:flex items-center gap-3 mt-4">
              <button onClick={() => m.setVolume(m.volume > 0 ? 0 : 1)} className="mx-muted" aria-label="Звук">{m.volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}</button>
              <input type="range" min={0} max={1} step={0.02} value={m.volume} onChange={(e) => m.setVolume(parseFloat(e.target.value))} className="mx-vol flex-1" aria-label="Громкость" />
            </div>

            {upNext && (
              <button onClick={() => setShowQueue(true)} className="mt-5 w-full mx-card px-3 py-2.5 flex items-center gap-3 text-left">
                <TrackCover track={upNext} size={36} radius={8} />
                <div className="min-w-0 flex-1"><p className="text-[11.5px] uppercase tracking-wide mx-muted">Далее</p><p className="text-[14px] truncate">{upNext.title} · <span className="mx-muted">{upNext.artist}</span></p></div>
                <ListMusic size={18} className="mx-muted shrink-0" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* очередь: тап по треку — перейти к нему */}
      {showQueue && (
        <div className="absolute inset-0 z-10 flex flex-col justify-end" style={{ background: "rgba(0,0,0,0.45)" }} onClick={() => setShowQueue(false)}>
          <div className="mx-music-up flex flex-col rounded-t-[20px] overflow-hidden" style={{ background: "var(--mx-surface)", maxHeight: "72%" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 h-14 shrink-0" style={{ borderBottom: "1px solid var(--mx-line)" }}>
              <p className="text-[17px] font-bold">Очередь · {m.queue.length}</p>
              <button onClick={() => setShowQueue(false)} className="w-9 h-9 flex items-center justify-center mx-muted" aria-label="Закрыть"><X size={20} /></button>
            </div>
            <div className="mx-scroll overflow-y-auto pb-4">
              {m.queue.map((q, i) => {
                const on = i === m.index;
                return (
                  <button key={`${q.id}:${i}`} onClick={() => { m.playQueue(m.queue, i); setShowQueue(false); }} className="w-full flex items-center gap-3 px-4 py-2 text-left active:bg-white/5" style={{ background: on ? "color-mix(in srgb, var(--mx-accent) 10%, transparent)" : undefined }}>
                    <TrackCover track={q} size={44} radius={9} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-medium truncate" style={{ color: on ? "var(--mx-accent)" : undefined }}>{q.title}</span>
                      <span className="block text-[12.5px] mx-muted truncate">{q.artist}</span>
                    </span>
                    {on ? <Equalizer active={m.playing} /> : <span className="text-[12.5px] mx-muted tabular-nums">{q.duration ? fmtTime(q.duration) : ""}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
