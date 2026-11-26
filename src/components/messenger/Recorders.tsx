"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { RefreshCcw, RotateCw, Send, Trash2, Volume2, VolumeX, X } from "lucide-react";
import { extFromMime, formatDuration, pickRecorderMime } from "./util";

export interface RecordedAudio {
  blob: Blob;
  duration: number;
  waveform: number[];
  mime: string;
}

const MAX_VOICE_SEC = 300;
/** Сколько последних столбиков живой волны показываем при записи. */
const LIVE_BARS = 56;

function micError(err: unknown): string {
  const name = (err as any)?.name;
  if (name === "NotAllowedError" || name === "SecurityError")
    return "Нет доступа к микрофону. Разреши его в настройках браузера (на сайте не должен быть запрещён микрофон).";
  if (name === "NotFoundError") return "Микрофон не найден.";
  if (name === "NotReadableError") return "Микрофон занят другим приложением.";
  return "Не удалось включить микрофон.";
}

/** Стили записи (панель в поле ввода, капсула «зафиксировать», круг записи видео). Рендерится вместе с самими окнами. */
export const REC_CSS = `
@keyframes mx-rec-pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.35; transform: scale(0.8); } }
@keyframes mx-rec-bar-in { from { opacity: 0; transform: translateY(8px) scale(0.98); } to { opacity: 1; transform: none; } }
@keyframes mx-rec-nudge { 0%, 100% { transform: translateX(0); opacity: 0.9; } 50% { transform: translateX(-5px); opacity: 0.45; } }
@keyframes mx-rec-up { 0%, 100% { transform: translateY(0); opacity: 0.9; } 50% { transform: translateY(-4px); opacity: 0.4; } }
@keyframes mx-vn-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes mx-vn-ring { 0% { transform: scale(0.98); opacity: 0.55; } 100% { transform: scale(1.12); opacity: 0; } }
.mx-rec-bar { animation: mx-rec-bar-in 0.2s var(--mx-ease, ease-out) both; }
.mx-rec-dot2 { width: 11px; height: 11px; border-radius: 50%; background: var(--mx-danger); animation: mx-rec-pulse 1s ease-in-out infinite; flex: none; }
.mx-rec-nudge { display: inline-flex; align-items: center; gap: 2px; animation: mx-rec-nudge 1.4s ease-in-out infinite; }
.mx-rec-wave { display: flex; align-items: center; justify-content: flex-end; gap: 2px; height: 28px; overflow: hidden; flex: 1; min-width: 0; }
.mx-rec-wave > span { width: 3px; flex: none; border-radius: 3px; background: var(--mx-accent); transition: height 0.09s linear; }
.mx-rec-halo { position: absolute; inset: 0; border-radius: 50%; background: var(--mx-accent); opacity: 0.22; pointer-events: none; transition: transform 0.1s linear; }
.mx-rec-lock { position: absolute; left: 50%; bottom: calc(100% + 14px); width: 44px; margin-left: -22px; border-radius: 22px; display: flex; flex-direction: column; align-items: center; justify-content: flex-start; gap: 6px; padding: 11px 0 9px; background: var(--mx-surface3, var(--mx-surface2)); color: var(--mx-muted); box-shadow: 0 6px 20px rgba(0, 0, 0, 0.28); pointer-events: none; animation: mx-rec-bar-in 0.2s var(--mx-ease, ease-out) both; z-index: 3; }
.mx-rec-lock .up { animation: mx-rec-up 1.2s ease-in-out infinite; }
.mx-vn-stage { animation: mx-vn-in 0.2s ease-out both; }
.mx-vn-circle { position: relative; width: min(340px, calc(100vw - 48px), calc(100dvh - 300px)); min-width: 190px; aspect-ratio: 1 / 1; touch-action: manipulation; }
.mx-vn-circle .ring-pulse { position: absolute; inset: 0; border-radius: 50%; border: 3px solid var(--mx-danger); animation: mx-vn-ring 1.4s ease-out infinite; pointer-events: none; }
.mx-vn-btn { width: 52px; height: 52px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; color: #fff; background: rgba(255, 255, 255, 0.14); transition: transform 0.12s, opacity 0.15s, background 0.15s; -webkit-tap-highlight-color: transparent; }
.mx-vn-btn:active:not(:disabled) { transform: scale(0.92); }
.mx-vn-btn:disabled { opacity: 0.3; }
.mx-vn-main { width: 76px; height: 76px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; background: transparent; border: 4px solid #fff; padding: 0; transition: transform 0.12s; -webkit-tap-highlight-color: transparent; }
.mx-vn-main:active { transform: scale(0.94); }
.mx-vn-main .core { width: 54px; height: 54px; border-radius: 50%; background: var(--mx-danger); transition: border-radius 0.2s var(--mx-ease, ease), width 0.2s, height 0.2s; }
.mx-vn-main.on .core { width: 28px; height: 28px; border-radius: 8px; }
@media (prefers-reduced-motion: reduce) { .mx-rec-dot2, .mx-rec-nudge, .mx-rec-lock .up, .mx-vn-circle .ring-pulse { animation: none; } }
`;

interface VoiceRec {
  recorder: MediaRecorder;
  stream: MediaStream;
  chunks: BlobPart[];
  started: number;
  ctx?: AudioContext;
  samples: number[];
  timer?: any;
  cancelled: boolean;
  mime: string;
  smooth: number;
}

/** Запись голосового: MediaRecorder + анализ громкости для живой волны и для итоговой «картинки» волны. */
export function useVoiceRecorder(onAutoStop?: (a: RecordedAudio) => void) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [levels, setLevels] = useState<number[]>([]);
  /** Текущая громкость 0…1 (сглаженная) — для «дыхания» кнопки микрофона. */
  const [level, setLevel] = useState(0);
  const rec = useRef<VoiceRec | null>(null);
  const onAutoRef = useRef(onAutoStop);
  onAutoRef.current = onAutoStop;
  const stopRef = useRef<() => Promise<RecordedAudio | null>>(() => Promise.resolve(null));

  const cleanup = useCallback(() => {
    const r = rec.current;
    if (!r) return;
    clearInterval(r.timer);
    r.stream.getTracks().forEach((t) => t.stop());
    r.ctx?.close().catch(() => {});
    rec.current = null;
    setRecording(false);
    setSeconds(0);
    setLevels([]);
    setLevel(0);
  }, []);

  useEffect(() => cleanup, [cleanup]);

  /** Возвращает текст ошибки или null, если запись началась. */
  const start = useCallback(async (): Promise<string | null> => {
    if (rec.current) return null;
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) return "Этот браузер не поддерживает запись голоса.";
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      const mime = pickRecorderMime("audio");
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const state = { recorder, stream, chunks: [] as BlobPart[], started: Date.now(), samples: [] as number[], cancelled: false, mime: recorder.mimeType || mime || "audio/webm", smooth: 0 } as VoiceRec;
      recorder.ondataavailable = (e) => e.data.size > 0 && state.chunks.push(e.data);
      const tick = () => {
        const sec = (Date.now() - state.started) / 1000;
        setSeconds(sec);
        if (sec >= MAX_VOICE_SEC && rec.current === state) {
          clearInterval(state.timer);
          stopRef.current().then((a) => { if (a) onAutoRef.current?.(a); });
        }
      };
      // громкость → волна
      try {
        const Ctx = window.AudioContext || (window as any).webkitAudioContext;
        const ctx: AudioContext = new Ctx();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        ctx.createMediaStreamSource(stream).connect(analyser);
        const buf = new Uint8Array(analyser.fftSize);
        state.ctx = ctx;
        state.timer = setInterval(() => {
          analyser.getByteTimeDomainData(buf);
          let sum = 0;
          for (let i = 0; i < buf.length; i++) {
            const v = (buf[i] - 128) / 128;
            sum += v * v;
          }
          const raw = Math.min(1, Math.sqrt(sum / buf.length) * 3.4);
          state.samples.push(raw);
          // быстро растёт, плавно падает — волна и кнопка «дышат», а не дёргаются
          state.smooth = raw > state.smooth ? raw : state.smooth * 0.82 + raw * 0.18;
          setLevels((l) => [...l.slice(-(LIVE_BARS - 1)), state.smooth]);
          setLevel(state.smooth);
          tick();
        }, 80);
      } catch {
        state.timer = setInterval(tick, 200);
      }
      rec.current = state;
      recorder.start(250);
      setRecording(true);
      return null;
    } catch (err) {
      return micError(err);
    }
  }, []);

  /** Останавливает запись и отдаёт результат (null — если отменено или слишком коротко). */
  const stop = useCallback((): Promise<RecordedAudio | null> => {
    const r = rec.current;
    if (!r) return Promise.resolve(null);
    return new Promise((resolve) => {
      const finish = () => {
        const duration = (Date.now() - r.started) / 1000;
        const blob = new Blob(r.chunks, { type: r.mime });
        const samples = r.samples;
        cleanup();
        if (r.cancelled || duration < 0.6 || blob.size === 0) return resolve(null);
        // сжимаем до 40 столбиков
        const N = 40;
        const wave: number[] = [];
        for (let i = 0; i < N; i++) {
          const a = Math.floor((i * samples.length) / N);
          const b = Math.max(a + 1, Math.floor(((i + 1) * samples.length) / N));
          const part = samples.slice(a, b);
          wave.push(part.length ? Math.max(0.12, Math.max(...part)) : 0.12);
        }
        resolve({ blob, duration, waveform: wave, mime: r.mime });
      };
      if (r.recorder.state === "inactive") finish();
      else {
        r.recorder.onstop = finish;
        r.recorder.stop();
      }
    });
  }, [cleanup]);
  stopRef.current = stop;

  const cancel = useCallback(() => {
    const r = rec.current;
    if (!r) return;
    r.cancelled = true;
    if (r.recorder.state !== "inactive") {
      r.recorder.onstop = () => cleanup();
      r.recorder.stop();
    } else cleanup();
  }, [cleanup]);

  return { recording, seconds, levels, level, start, stop, cancel };
}

export interface RecordedVideo {
  blob: Blob;
  duration: number;
  mime: string;
}

const MAX_NOTE_SEC = 60;

/**
 * Полноэкранная запись видеокружка (до 60 с), как в Telegram: большой круг с камерой, кольцо прогресса,
 * тап по кругу или красной кнопке — старт/стоп, предпросмотр со звуком, «переснять» и «отправить».
 * autoStart — запись начинается сразу, как только включится камера (когда кнопку в поле ввода удерживали).
 */
export function VideoNoteRecorder({ onCancel, onSend, autoStart = false }: { onCancel: () => void; onSend: (v: RecordedVideo) => void; autoStart?: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunks = useRef<BlobPart[]>([]);
  const startedAt = useRef(0);
  const autoPending = useRef(autoStart);
  const startRef = useRef<() => void>(() => {});
  const resultRef = useRef<{ url: string; video: RecordedVideo } | null>(null);
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [result, setResult] = useState<{ url: string; video: RecordedVideo } | null>(null);
  const [sound, setSound] = useState(true);
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useEffect(() => setTarget(document.getElementById("mx-root")), []);
  resultRef.current = result;

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setReady(false);
  };

  const openCamera = useCallback(async (mode: "user" | "environment") => {
    stopStream();
    setReady(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: mode, width: { ideal: 720 }, height: { ideal: 720 }, aspectRatio: { ideal: 1 } },
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;
      const v = videoRef.current;
      if (v) {
        v.srcObject = stream;
        v.play().catch(() => {});
      }
      setError("");
      setReady(true);
      if (autoPending.current) {
        autoPending.current = false;
        // даём кадру появиться, чтобы запись не начиналась с чёрного
        setTimeout(() => startRef.current(), 250);
      }
    } catch (err) {
      const name = (err as any)?.name;
      setError(
        name === "NotAllowedError" || name === "SecurityError" ? "Нет доступа к камере или микрофону. Разреши их в настройках браузера."
          : name === "NotFoundError" ? "Камера не найдена."
          : name === "NotReadableError" ? "Камера занята другим приложением."
          : "Не удалось включить камеру."
      );
    }
  }, []);

  useEffect(() => {
    if (!target) return;
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("Этот браузер не поддерживает запись видео.");
      return;
    }
    openCamera(facing);
    return () => {
      const r = recRef.current;
      if (r && r.state !== "inactive") { r.onstop = null; try { r.stop(); } catch {} }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (resultRef.current) URL.revokeObjectURL(resultRef.current.url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => {
      const s = (Date.now() - startedAt.current) / 1000;
      setSeconds(s);
      if (s >= MAX_NOTE_SEC) stopRecording();
    }, 100);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording]);

  // предпросмотр: сразу со звуком (мы уже внутри жеста нажатия); если браузер не дал — тихо
  useEffect(() => {
    const v = previewRef.current;
    if (!result || !v) return;
    v.muted = false;
    setSound(true);
    v.play().catch(() => { v.muted = true; setSound(false); v.play().catch(() => {}); });
  }, [result]);

  // видео-элемент пересоздаётся после «переснять» — подвешиваем поток к нему, когда он появился
  useEffect(() => {
    const v = videoRef.current;
    const st = streamRef.current;
    if (!v || !st || !ready || result) return;
    if (v.srcObject !== st) v.srcObject = st;
    v.play().catch(() => {});
  }, [ready, result]);

  const startRecording = () => {
    const stream = streamRef.current;
    if (!stream || recRef.current?.state === "recording") return;
    const mime = pickRecorderMime("video");
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 1_400_000, audioBitsPerSecond: 96_000 } : undefined);
    } catch {
      setError("Не удалось начать запись видео.");
      return;
    }
    chunks.current = [];
    recorder.ondataavailable = (e) => e.data.size > 0 && chunks.current.push(e.data);
    recorder.onstop = () => {
      const duration = (Date.now() - startedAt.current) / 1000;
      const type = recorder.mimeType || mime || "video/webm";
      const blob = new Blob(chunks.current, { type });
      setRecording(false);
      if (duration < 0.8 || blob.size === 0) {
        setSeconds(0);
        return;
      }
      stopStream(); // камера больше не нужна — гасим индикатор, пока смотрим предпросмотр
      setResult({ url: URL.createObjectURL(blob), video: { blob, duration, mime: type } });
    };
    recRef.current = recorder;
    startedAt.current = Date.now();
    recorder.start(300);
    setSeconds(0);
    setRecording(true);
    try { navigator.vibrate?.(10); } catch {}
  };
  startRef.current = startRecording;

  const stopRecording = () => {
    if (recRef.current && recRef.current.state !== "inactive") recRef.current.stop();
  };

  /** Выбросить текущую запись и продолжить снимать. */
  const discardRecording = () => {
    const r = recRef.current;
    if (r && r.state !== "inactive") { r.onstop = null; r.stop(); }
    setRecording(false);
    setSeconds(0);
  };

  const retake = () => {
    if (result) URL.revokeObjectURL(result.url);
    setResult(null);
    setSeconds(0);
    openCamera(facing);
  };

  const close = () => {
    const r = recRef.current;
    if (r && r.state !== "inactive") { r.onstop = null; r.stop(); }
    onCancel();
  };

  const flip = () => {
    const next = facing === "user" ? "environment" : "user";
    setFacing(next);
    openCamera(next);
  };

  const onCircle = () => {
    if (error) return;
    if (result) {
      const v = previewRef.current;
      if (!v) return;
      v.muted = !v.muted;
      setSound(!v.muted);
      if (v.paused) v.play().catch(() => {});
      return;
    }
    if (!ready) return;
    if (recording) stopRecording();
    else startRecording();
  };

  if (!target) return null;
  const progress = Math.min(1, seconds / MAX_NOTE_SEC);
  const shownTime = result ? result.video.duration : seconds;
  const hint = error ? "" : result ? "Предпросмотр · нажми на кружок, чтобы вкл/выкл звук" : recording ? "Идёт запись · нажми, чтобы закончить" : ready ? "Нажми на кружок, чтобы начать запись" : "Включаем камеру…";

  return createPortal(
    <div className="absolute inset-0 flex flex-col items-center mx-vn-stage" style={{ zIndex: 70, background: "radial-gradient(120% 80% at 50% 30%, rgba(40,40,48,0.96), rgba(0,0,0,0.97))" }}>
      <style>{REC_CSS}</style>

      {/* верх: таймер-плашка и закрыть */}
      <div className="w-full flex items-center justify-between px-3" style={{ paddingTop: "calc(env(safe-area-inset-top) + 12px)" }}>
        <span className="w-11" />
        <span className="inline-flex items-center gap-2 px-3.5 h-8 rounded-full text-white text-[14px] tabular-nums" style={{ background: "rgba(255,255,255,0.12)", opacity: recording || result ? 1 : 0, transition: "opacity 0.2s" }}>
          {recording && <span className="mx-rec-dot2" style={{ width: 9, height: 9 }} />}
          {formatDuration(shownTime)}
          {recording && <span className="text-white/50">/ 1:00</span>}
        </span>
        <button onClick={close} className="mx-vn-btn" style={{ width: 44, height: 44 }} aria-label="Закрыть">
          <X size={22} />
        </button>
      </div>

      <div className="flex-1 w-full flex flex-col items-center justify-center min-h-0 px-6">
        {error ? (
          <div className="flex flex-col items-center gap-4 max-w-sm text-center">
            <p className="text-white/85 text-[15px]">{error}</p>
            <button onClick={() => openCamera(facing)} className="px-5 h-11 rounded-full text-[14.5px] font-medium inline-flex items-center gap-2" style={{ background: "var(--mx-accent)", color: "var(--mx-accent-text)" }}>
              <RotateCw size={17} /> Попробовать снова
            </button>
          </div>
        ) : (
          <>
            <div className="mx-vn-circle" onClick={onCircle} role="button" aria-label={result ? "Звук" : recording ? "Остановить запись" : "Начать запись"}>
              {recording && <span className="ring-pulse" />}
              <div className="absolute rounded-full overflow-hidden bg-black" style={{ inset: "3%", boxShadow: "0 20px 60px rgba(0,0,0,0.55)" }}>
                {result ? (
                  <video ref={previewRef} src={result.url} className="w-full h-full object-cover" loop playsInline />
                ) : (
                  <video ref={videoRef} className="w-full h-full object-cover" style={{ transform: facing === "user" ? "scaleX(-1)" : undefined, opacity: ready ? 1 : 0.25, transition: "opacity 0.25s" }} muted playsInline autoPlay />
                )}
                {result && !sound && (
                  <span className="absolute left-1/2 -translate-x-1/2 bottom-5 w-9 h-9 rounded-full flex items-center justify-center text-white" style={{ background: "rgba(0,0,0,0.5)" }}><VolumeX size={18} /></span>
                )}
              </div>
              <svg className="absolute inset-0 w-full h-full -rotate-90 pointer-events-none" viewBox="0 0 100 100" fill="none">
                <circle cx="50" cy="50" r="48.6" stroke="rgba(255,255,255,0.16)" strokeWidth={1.5} />
                {(recording || result) && (
                  <circle cx="50" cy="50" r="48.6" stroke={result ? "rgba(255,255,255,0.9)" : "var(--mx-accent)"} strokeWidth={1.5} strokeLinecap="round" pathLength={100} strokeDasharray={100} strokeDashoffset={result ? 0 : 100 * (1 - progress)} style={{ transition: "stroke-dashoffset 0.1s linear" }} />
                )}
              </svg>
            </div>
            <p className="text-white/70 text-[13.5px] mt-5 h-5 text-center">{hint}</p>
          </>
        )}
      </div>

      {/* низ: управление */}
      <div className="w-full flex items-center justify-center gap-9" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 28px)", minHeight: 76 + 28 }}>
        {error ? null : result ? (
          <>
            <button onClick={retake} className="mx-vn-btn" aria-label="Переснять"><RefreshCcw size={22} /></button>
            <button onClick={() => onSend(result.video)} className="w-[76px] h-[76px] rounded-full flex items-center justify-center active:scale-95 transition-transform" style={{ background: "var(--mx-accent)", color: "var(--mx-accent-text)", boxShadow: "0 10px 30px color-mix(in srgb, var(--mx-accent) 45%, transparent)" }} aria-label="Отправить">
              <Send size={30} className="ml-0.5" />
            </button>
            <button
              onClick={() => { const v = previewRef.current; if (v) { v.muted = !v.muted; setSound(!v.muted); } }}
              className="mx-vn-btn"
              aria-label={sound ? "Выключить звук" : "Включить звук"}
            >
              {sound ? <Volume2 size={22} /> : <VolumeX size={22} />}
            </button>
          </>
        ) : (
          <>
            <button onClick={discardRecording} disabled={!recording} className="mx-vn-btn" aria-label="Сбросить запись" style={{ visibility: recording ? "visible" : "hidden" }}><Trash2 size={22} /></button>
            <button onClick={recording ? stopRecording : startRecording} disabled={!ready} className={`mx-vn-main${recording ? " on" : ""}`} aria-label={recording ? "Остановить" : "Записать"} style={{ opacity: ready ? 1 : 0.4 }}>
              <span className="core" />
            </button>
            <button onClick={flip} disabled={recording} className="mx-vn-btn" aria-label="Сменить камеру"><RotateCw size={22} /></button>
          </>
        )}
      </div>
    </div>,
    target
  );
}

export { extFromMime };
