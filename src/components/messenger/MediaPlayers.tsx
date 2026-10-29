"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { formatDuration } from "./util";

// Одновременно играет только одно голосовое / кружок.
let currentMedia: HTMLMediaElement | null = null;
function claimPlayback(el: HTMLMediaElement) {
  if (currentMedia && currentMedia !== el) currentMedia.pause();
  currentMedia = el;
}

const SPEEDS = [1, 1.5, 2];

export function VoicePlayer({ url, duration, waveform, mine }: { url: string; duration?: number; waveform?: number[]; mine: boolean }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [total, setTotal] = useState(duration ?? 0);

  const bars = useMemo(() => {
    const src = waveform && waveform.length > 0 ? waveform : Array.from({ length: 36 }, (_, i) => 0.3 + 0.5 * Math.abs(Math.sin(i * 1.7)));
    return src;
  }, [waveform]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const onTime = () => setProgress(el.duration ? el.currentTime / el.duration : 0);
    const onEnd = () => {
      setPlaying(false);
      setProgress(0);
    };
    const onMeta = () => {
      if (Number.isFinite(el.duration) && el.duration > 0) setTotal(el.duration);
    };
    const onPause = () => setPlaying(false);
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("ended", onEnd);
    el.addEventListener("loadedmetadata", onMeta);
    el.addEventListener("pause", onPause);
    return () => {
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("ended", onEnd);
      el.removeEventListener("loadedmetadata", onMeta);
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
      el.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    } else el.pause();
  };

  const cycleSpeed = (e: React.MouseEvent) => {
    e.stopPropagation();
    const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
    setSpeed(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = audioRef.current;
    if (!el || !el.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    el.currentTime = ((e.clientX - rect.left) / rect.width) * el.duration;
  };

  const fg = mine ? "var(--mx-out-text)" : "var(--mx-accent)";
  const shown = playing || progress > 0 ? total * (1 - progress) : total;

  return (
    <div className="flex items-center gap-2.5 py-1" style={{ minWidth: 210 }}>
      <audio ref={audioRef} src={url} preload="metadata" />
      <button
        onClick={toggle}
        className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
        style={{ background: mine ? "var(--mx-out-text)" : "var(--mx-accent)", color: mine ? "var(--mx-out)" : "var(--mx-accent-text)" }}
        aria-label={playing ? "Пауза" : "Слушать"}
      >
        {playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" className="ml-0.5" />}
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-[2px] h-7 cursor-pointer" onClick={seek}>
          {bars.map((v, i) => (
            <span
              key={i}
              className="flex-1 rounded-full"
              style={{ height: `${Math.max(14, Math.min(100, v * 100))}%`, background: fg, opacity: i / bars.length <= progress ? 1 : 0.38, minWidth: 2 }}
            />
          ))}
        </div>
        <div className="flex items-center justify-between text-[11.5px] opacity-75 mt-0.5">
          <span>{formatDuration(shown)}</span>
          <button onClick={cycleSpeed} className="px-1.5 rounded-full" style={{ background: "rgba(127,127,127,0.25)" }}>
            {speed}×
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

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onTime = () => setProgress(el.duration ? el.currentTime / el.duration : 0);
    el.addEventListener("timeupdate", onTime);
    return () => {
      el.removeEventListener("timeupdate", onTime);
      if (currentMedia === el) currentMedia = null;
    };
  }, []);

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

  const r = size / 2 - 3;
  const c = 2 * Math.PI * r;
  return (
    <button onClick={toggle} className="relative rounded-full overflow-hidden block" style={{ width: `min(${size}px, 62vw)`, aspectRatio: "1 / 1", maxWidth: "100%", background: "var(--mx-surface2)" }}>
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
        <svg className="absolute inset-0 -rotate-90 pointer-events-none w-full h-full" viewBox={`0 0 ${size} ${size}`}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth={3} strokeDasharray={c} strokeDashoffset={c * (1 - progress)} strokeLinecap="round" />
        </svg>
      )}
    </button>
  );
}
