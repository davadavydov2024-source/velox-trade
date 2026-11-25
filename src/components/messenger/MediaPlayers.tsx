"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Pause, Play, VolumeX } from "lucide-react";
import { formatDuration } from "./util";
import { saveVideoNoteToGallery, saveVoiceToGallery } from "./mediaSave";
import { Spinner } from "./ui";
import { useToast } from "@/lib/toastContext";

// Одновременно играет только одно голосовое / кружок.
let currentMedia: HTMLMediaElement | null = null;
function claimPlayback(el: HTMLMediaElement) {
  if (currentMedia && currentMedia !== el) currentMedia.pause();
  currentMedia = el;
}

const SPEEDS = [1, 1.5, 2];

const MEDIA_CSS = `
.mx-vp-bars { display: flex; align-items: center; gap: 2px; height: 30px; cursor: pointer; touch-action: pan-y; user-select: none; -webkit-user-select: none; }
.mx-vp-bars > span { flex: 1 1 0; min-width: 2px; max-width: 5px; border-radius: 3px; transition: opacity 0.15s, transform 0.12s; transform-origin: center; }
.mx-vp-bars.scrub > span { transition: none; }
.mx-vp-btn { width: 42px; height: 42px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; flex: none; transition: transform 0.12s; -webkit-tap-highlight-color: transparent; }
.mx-vp-btn:active { transform: scale(0.92); }
.mx-vp-chip { padding: 0 7px; height: 18px; border-radius: 9px; font-size: 11px; font-weight: 700; line-height: 18px; background: rgba(127, 127, 127, 0.26); }
.mx-vn-play { transition: transform 0.2s var(--mx-ease, ease); }
.mx-vn-play:active { transform: scale(0.97); }
`;

export function VoicePlayer({ url, duration, waveform, mine }: { url: string; duration?: number; waveform?: number[]; mine: boolean }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const barsRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [now, setNow] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [total, setTotal] = useState(duration ?? 0);
  const [scrub, setScrub] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const bars = useMemo(() => {
    const src = waveform && waveform.length > 0 ? waveform : Array.from({ length: 36 }, (_, i) => 0.3 + 0.5 * Math.abs(Math.sin(i * 1.7)));
    return src;
  }, [waveform]);

  // длина: у записей MediaRecorder (webm) duration у <audio> бывает Infinity — тогда верим длительности из сообщения
  const len = () => {
    const el = audioRef.current;
    if (el && Number.isFinite(el.duration) && el.duration > 0) return el.duration;
    return total;
  };

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const onTime = () => setNow(el.currentTime);
    const onEnd = () => {
      setPlaying(false);
      setNow(0);
    };
    const onMeta = () => {
      if (Number.isFinite(el.duration) && el.duration > 0) setTotal(el.duration);
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("ended", onEnd);
    el.addEventListener("loadedmetadata", onMeta);
    el.addEventListener("durationchange", onMeta);
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    return () => {
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("ended", onEnd);
      el.removeEventListener("loadedmetadata", onMeta);
      el.removeEventListener("durationchange", onMeta);
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
      if (currentMedia === el) currentMedia = null;
    };
  }, []);

  const toggle = () => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) {
      claimPlayback(el);
      el.playbackRate = speed;
      el.play().catch(() => setPlaying(false));
    } else el.pause();
  };

  const cycleSpeed = (e: React.MouseEvent) => {
    e.stopPropagation();
    const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
    setSpeed(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  };

  const save = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (saving) return;
    setSaving(true);
    try {
      await saveVoiceToGallery(url, `miligram-voice-${Date.now()}`);
      toast("success", "Голосовое сохранено на устройство");
    } catch {
      toast("error", "Не удалось сохранить голосовое");
    } finally {
      setSaving(false);
    }
  };

  // перемотка нажатием и протяжкой по волне
  const ratioFrom = (e: React.PointerEvent) => {
    const r = barsRef.current!.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
  };
  const seekTo = (ratio: number) => {
    const el = audioRef.current;
    const L = len();
    if (!el || !L) return;
    try { el.currentTime = ratio * L; } catch {}
    setNow(ratio * L);
  };

  const L = len();
  const progress = scrub ?? (L > 0 ? Math.min(1, now / L) : 0);
  const started = playing || progress > 0;
  const shown = started ? Math.max(0, L - progress * L) : L;
  const fg = mine ? "var(--mx-out-text)" : "var(--mx-accent)";

  return (
    <div className="flex items-center gap-3 py-1" style={{ minWidth: 220 }}>
      <style>{MEDIA_CSS}</style>
      <audio ref={audioRef} src={url} preload="metadata" />
      <button
        onClick={toggle}
        className="mx-vp-btn"
        style={{ background: mine ? "var(--mx-out-text)" : "var(--mx-accent)", color: mine ? "var(--mx-out)" : "var(--mx-accent-text)" }}
        aria-label={playing ? "Пауза" : "Слушать"}
      >
        {playing ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" className="ml-0.5" />}
      </button>
      <div className="flex-1 min-w-0">
        <div
          ref={barsRef}
          className={`mx-vp-bars${scrub !== null ? " scrub" : ""}`}
          role="slider"
          aria-label="Перемотка"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
          onPointerDown={(e) => { try { barsRef.current?.setPointerCapture(e.pointerId); } catch {} setScrub(ratioFrom(e)); }}
          onPointerMove={(e) => { if (scrub !== null) setScrub(ratioFrom(e)); }}
          onPointerUp={(e) => { const r = ratioFrom(e); setScrub(null); seekTo(r); }}
          onPointerCancel={() => setScrub(null)}
        >
          {bars.map((v, i) => (
            <span
              key={i}
              style={{ height: `${Math.max(16, Math.min(100, v * 100))}%`, background: fg, opacity: (i + 0.5) / bars.length <= progress ? 1 : 0.34, transform: scrub !== null && Math.abs((i + 0.5) / bars.length - progress) < 0.04 ? "scaleY(1.18)" : undefined }}
            />
          ))}
        </div>
        <div className="flex items-center gap-2 text-[11.5px] mt-0.5 tabular-nums" style={{ opacity: 0.8 }}>
          <span>{formatDuration(shown)}</span>
          <span className="flex-1" />
          {started && (
            <button onClick={cycleSpeed} className="mx-vp-chip" aria-label="Скорость воспроизведения">
              {speed}×
            </button>
          )}
          <button onClick={save} disabled={saving} aria-label="Сохранить в галерею" className="w-[22px] h-[22px] rounded-full flex items-center justify-center shrink-0 disabled:opacity-60" style={{ background: "rgba(127,127,127,0.22)" }}>
            {saving ? <Spinner size={11} /> : <Download size={12} />}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Видеокружок: в ленте крутится без звука, по нажатию играет со звуком с начала. */
export function VideoNoteView({ url, size = 240 }: { url: string; size?: number }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [active, setActive] = useState(false);
  const [progress, setProgress] = useState(0);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onTime = () => setProgress(Number.isFinite(el.duration) && el.duration ? el.currentTime / el.duration : 0);
    el.addEventListener("timeupdate", onTime);
    return () => {
      el.removeEventListener("timeupdate", onTime);
      if (currentMedia === el) currentMedia = null;
    };
  }, []);

  // другое голосовое/кружок взяло звук — этот возвращаем в «немой» режим
  useEffect(() => {
    const el = ref.current;
    if (!el || !active) return;
    const onPause = () => {
      if (el.ended) return;
      el.muted = true;
      el.loop = true;
      setActive(false);
      setProgress(0);
      el.play().catch(() => {});
    };
    el.addEventListener("pause", onPause);
    return () => el.removeEventListener("pause", onPause);
  }, [active]);

  const toggle = () => {
    const el = ref.current;
    if (!el) return;
    if (!active) {
      claimPlayback(el);
      el.muted = false;
      el.loop = false;
      el.currentTime = 0;
      el.play().catch(() => {});
      setActive(true);
    } else {
      el.muted = true;
      el.loop = true;
      setActive(false);
      setProgress(0);
      el.play().catch(() => {});
    }
  };

  const save = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (saving) return;
    setSaving(true);
    try {
      const kind = await saveVideoNoteToGallery(url, `miligram-video-${Date.now()}`);
      toast("success", kind === "watermarked" ? "Видео сохранено в галерею" : "Видео сохранено (без знака — браузер не разрешил обработку кадров)");
    } catch {
      toast("error", "Не удалось сохранить видео");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="relative" style={{ width: `min(${size}px, 62vw)`, aspectRatio: "1 / 1", maxWidth: "100%" }}>
      <style>{MEDIA_CSS}</style>
      <button
        onClick={toggle}
        className="mx-vn-play relative rounded-full overflow-hidden block w-full h-full"
        style={{ background: "var(--mx-surface2)", boxShadow: active ? "0 0 0 3px color-mix(in srgb, var(--mx-accent) 55%, transparent)" : undefined, transition: "box-shadow 0.2s" }}
        aria-label={active ? "Выключить звук" : "Смотреть со звуком"}
      >
        <video
          ref={ref}
          src={url}
          className="w-full h-full object-cover"
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          onEnded={() => {
            setActive(false);
            setProgress(0);
            if (ref.current) {
              ref.current.muted = true;
              ref.current.loop = true;
              ref.current.play().catch(() => {});
            }
          }}
        />
        {active && (
          <svg className="absolute inset-0 -rotate-90 pointer-events-none w-full h-full" viewBox="0 0 100 100" fill="none">
            <circle cx="50" cy="50" r="48.4" stroke="rgba(255,255,255,0.95)" strokeWidth={2.4} strokeLinecap="round" pathLength={100} strokeDasharray={100} strokeDashoffset={100 * (1 - progress)} />
          </svg>
        )}
        {!active && (
          <span className="absolute top-2.5 left-1/2 -translate-x-1/2 w-7 h-7 rounded-full flex items-center justify-center text-white pointer-events-none" style={{ background: "rgba(0,0,0,0.45)" }}>
            <VolumeX size={14} />
          </span>
        )}
      </button>
      <button
        onClick={save}
        disabled={saving}
        aria-label="Сохранить в галерею"
        className="absolute bottom-1.5 right-1.5 w-8 h-8 rounded-full flex items-center justify-center mx-glass disabled:opacity-70"
      >
        {saving ? <Spinner size={14} /> : <Download size={15} />}
      </button>
    </div>
  );
}
