"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Camera, Check, RefreshCcw, Send, X } from "lucide-react";
import { extFromMime, formatDuration, pickRecorderMime } from "./util";

export interface RecordedAudio {
  blob: Blob;
  duration: number;
  waveform: number[];
  mime: string;
}

const MAX_VOICE_SEC = 300;

function micError(err: unknown): string {
  const name = (err as any)?.name;
  if (name === "NotAllowedError" || name === "SecurityError")
    return "Нет доступа к микрофону. Разреши его в настройках браузера (на сайте не должен быть запрещён микрофон).";
  if (name === "NotFoundError") return "Микрофон не найден.";
  return "Не удалось включить микрофон.";
}

/** Запись голосового: MediaRecorder + анализ громкости для волны. */
export function useVoiceRecorder() {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [levels, setLevels] = useState<number[]>([]);
  const rec = useRef<{
    recorder: MediaRecorder;
    stream: MediaStream;
    chunks: BlobPart[];
    started: number;
    ctx?: AudioContext;
    samples: number[];
    timer?: any;
    cancelled: boolean;
    mime: string;
  } | null>(null);

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
  }, []);

  useEffect(() => cleanup, [cleanup]);

  /** Возвращает текст ошибки или null, если запись началась. */
  const start = useCallback(async (): Promise<string | null> => {
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) return "Этот браузер не поддерживает запись голоса.";
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const mime = pickRecorderMime("audio");
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const state = { recorder, stream, chunks: [] as BlobPart[], started: Date.now(), samples: [] as number[], cancelled: false, mime: recorder.mimeType || mime || "audio/webm" } as NonNullable<typeof rec.current>;
      recorder.ondataavailable = (e) => e.data.size > 0 && state.chunks.push(e.data);
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
          const level = Math.min(1, Math.sqrt(sum / buf.length) * 3.2);
          state.samples.push(level);
          setLevels((l) => [...l.slice(-40), level]);
          const sec = (Date.now() - state.started) / 1000;
          setSeconds(sec);
          if (sec >= MAX_VOICE_SEC) recorder.stop();
        }, 100);
      } catch {
        state.timer = setInterval(() => setSeconds((Date.now() - state.started) / 1000), 200);
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

  const cancel = useCallback(() => {
    const r = rec.current;
    if (!r) return;
    r.cancelled = true;
    if (r.recorder.state !== "inactive") {
      r.recorder.onstop = () => cleanup();
      r.recorder.stop();
    } else cleanup();
  }, [cleanup]);

  return { recording, seconds, levels, start, stop, cancel };
}

export interface RecordedVideo {
  blob: Blob;
  duration: number;
  mime: string;
}

const MAX_NOTE_SEC = 60;

/** Полноэкранная запись видеокружка (до 60 с): камера в круге, кнопка записи, предпросмотр, отправка. */
export function VideoNoteRecorder({ onCancel, onSend }: { onCancel: () => void; onSend: (v: RecordedVideo) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunks = useRef<BlobPart[]>([]);
  const startedAt = useRef(0);
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [error, setError] = useState("");
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [result, setResult] = useState<{ url: string; video: RecordedVideo } | null>(null);
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useEffect(() => setTarget(document.getElementById("vc-root")), []);
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  });

  const openCamera = useCallback(async (mode: "user" | "environment") => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: mode, width: { ideal: 640 }, height: { ideal: 640 } },
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }
      setError("");
    } catch (err) {
      const name = (err as any)?.name;
      setError(name === "NotAllowedError" ? "Нет доступа к камере или микрофону. Разреши их в настройках браузера." : "Не удалось включить камеру.");
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
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => {
      const s = (Date.now() - startedAt.current) / 1000;
      setSeconds(s);
      if (s >= MAX_NOTE_SEC) stopRecording();
    }, 150);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording]);

  const startRecording = () => {
    const stream = streamRef.current;
    if (!stream) return;
    const mime = pickRecorderMime("video");
    const recorder = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 1_200_000 } : undefined);
    chunks.current = [];
    recorder.ondataavailable = (e) => e.data.size > 0 && chunks.current.push(e.data);
    recorder.onstop = () => {
      const duration = (Date.now() - startedAt.current) / 1000;
      const type = recorder.mimeType || mime || "video/webm";
      const blob = new Blob(chunks.current, { type });
      if (duration < 0.8 || blob.size === 0) {
        setRecording(false);
        setSeconds(0);
        return;
      }
      setResult({ url: URL.createObjectURL(blob), video: { blob, duration, mime: type } });
      setRecording(false);
    };
    recRef.current = recorder;
    startedAt.current = Date.now();
    recorder.start(300);
    setSeconds(0);
    setRecording(true);
  };

  const stopRecording = () => {
    if (recRef.current && recRef.current.state !== "inactive") recRef.current.stop();
  };

  const retake = () => {
    if (result) URL.revokeObjectURL(result.url);
    setResult(null);
    setSeconds(0);
    openCamera(facing);
  };

  const close = () => {
    if (recRef.current && recRef.current.state !== "inactive") {
      recRef.current.onstop = null;
      recRef.current.stop();
    }
    if (result) URL.revokeObjectURL(result.url);
    onCancel();
  };

  if (!target) return null;
  const SIZE = 280;
  const r = SIZE / 2 + 8;
  const c = 2 * Math.PI * r;
  return createPortal(
    <div className="absolute inset-0 flex flex-col items-center justify-center vc-fade" style={{ zIndex: 70, background: "rgba(0,0,0,0.92)" }}>
      <button onClick={close} className="absolute top-3 right-3 w-10 h-10 rounded-full flex items-center justify-center text-white" style={{ background: "rgba(255,255,255,0.14)", marginTop: "env(safe-area-inset-top)" }} aria-label="Закрыть">
        <X size={22} />
      </button>

      {error ? (
        <p className="text-white/80 text-center px-8 max-w-sm">{error}</p>
      ) : (
        <>
          <div className="relative" style={{ width: SIZE + 24, height: SIZE + 24 }}>
            <svg className="absolute inset-0 -rotate-90" width={SIZE + 24} height={SIZE + 24}>
              <circle cx={(SIZE + 24) / 2} cy={(SIZE + 24) / 2} r={r - 4} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth={4} />
              {recording && (
                <circle cx={(SIZE + 24) / 2} cy={(SIZE + 24) / 2} r={r - 4} fill="none" stroke="var(--vc-accent)" strokeWidth={4} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - seconds / MAX_NOTE_SEC)} />
              )}
            </svg>
            <div className="absolute rounded-full overflow-hidden bg-black" style={{ inset: 12 }}>
              {result ? (
                <video src={result.url} className="w-full h-full object-cover" autoPlay loop playsInline />
              ) : (
                <video ref={videoRef} className="w-full h-full object-cover" style={{ transform: facing === "user" ? "scaleX(-1)" : undefined }} muted playsInline autoPlay />
              )}
            </div>
          </div>
          <p className="text-white/80 mt-4 h-6">{recording || result ? formatDuration(result ? result.video.duration : seconds) : "Нажми, чтобы записать"}</p>

          <div className="flex items-center gap-6 mt-5">
            {result ? (
              <>
                <button onClick={retake} className="w-12 h-12 rounded-full flex items-center justify-center text-white" style={{ background: "rgba(255,255,255,0.14)" }} aria-label="Переснять">
                  <RefreshCcw size={20} />
                </button>
                <button onClick={() => onSend(result.video)} className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: "var(--vc-accent)", color: "var(--vc-accent-text)" }} aria-label="Отправить">
                  <Send size={26} />
                </button>
              </>
            ) : (
              <>
                <span className="w-12" />
                <button
                  onClick={recording ? stopRecording : startRecording}
                  className="w-16 h-16 rounded-full flex items-center justify-center"
                  style={{ background: recording ? "#fff" : "var(--vc-danger)" }}
                  aria-label={recording ? "Остановить" : "Записать"}
                >
                  {recording ? <Check size={28} color="#000" /> : <span className="w-6 h-6 rounded-full bg-white" />}
                </button>
                <button onClick={() => { const next = facing === "user" ? "environment" : "user"; setFacing(next); openCamera(next); }} disabled={recording} className="w-12 h-12 rounded-full flex items-center justify-center text-white disabled:opacity-30" style={{ background: "rgba(255,255,255,0.14)" }} aria-label="Сменить камеру">
                  <Camera size={20} />
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>,
    target
  );
}

export { extFromMime };
