"use client";

import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, MessageCircle, Mic, MicOff, Phone, PhoneOff } from "lucide-react";
import { auth } from "@/lib/firebase";
import { getDeviceId } from "@/lib/messenger/client";
import { useToast } from "@/lib/toastContext";
import { mApi } from "./api";
import { useLiveAccount } from "./hooks";
import { callOf } from "@/lib/messenger/callTypes";
import { MChat } from "./mtypes";
import { useMusic } from "./MusicPlayer";
import { Avatar } from "./ui";
import { formatDuration } from "./util";

/**
 * Голосовые звонки 1-на-1 (WebRTC). Состояние звонка лежит в документе чата (messengerChats/{id}.call) и приходит
 * сюда вместе с обычным списком чатов; все записи делает сервер (/api/messenger/call). Кандидаты ICE не пересылаем по одному:
 * ждём, пока браузер соберёт их все (до ~4 с), и отправляем одним SDP — так на звонок приходится всего две записи.
 */

type Phase = "incoming" | "calling" | "connecting" | "connected" | "ended";

interface View {
  phase: Phase;
  chatId: string;
  peerUid: string;
  callId: string | null;
  dir: "in" | "out";
  muted: boolean;
  minimized: boolean;
  since: number | null; // когда разговор реально начался
  weak: boolean; // связь пропала, пытаемся восстановить
  note: string; // подпись на экране «звонок завершён»
}

interface CallApi {
  /** В этом браузере звонки возможны (WebRTC + микрофон). */
  available: boolean;
  /** Сейчас уже идёт звонок/вызов. */
  busy: boolean;
  start: (chatId: string) => void;
}

const Ctx = createContext<CallApi>({ available: false, busy: false, start: () => {} });
export const useCall = () => useContext(Ctx);

const RING_OUT_MS = 45_000; // сколько звоним, прежде чем сдаться
const RING_IN_MS = 50_000; // сколько звонит входящий у нас
const FRESH_MS = 75_000; // звонок старше — считаем устаревшим (с запасом на разницу часов)
const CONNECT_MS = 25_000; // после ответа соединение должно подняться за это время
const GATHER_MS = 4_000;

// ---- Мелодии (WebAudio: без файлов) ----
class Tones {
  private ctx: AudioContext | null = null;
  private timer: any = null;
  private vib: any = null;

  private ensure(): AudioContext | null {
    try {
      if (!this.ctx) {
        const C = window.AudioContext || (window as any).webkitAudioContext;
        this.ctx = new C();
      }
      if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
      return this.ctx;
    } catch {
      return null;
    }
  }
  private beep(freq: number, at: number, dur: number, vol: number) {
    const ctx = this.ensure();
    if (!ctx) return;
    const t0 = ctx.currentTime + at;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.02);
    g.gain.setValueAtTime(vol, t0 + Math.max(0.03, dur - 0.04));
    g.gain.linearRampToValueAtTime(0, t0 + dur);
    o.connect(g);
    g.connect(ctx.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }
  private loop(fn: () => void, every: number) {
    this.stop();
    fn();
    this.timer = setInterval(fn, every);
  }
  /** Входящий: двойной «трель» + вибрация. */
  ring() {
    this.loop(() => {
      [[880, 0], [659, 0.38], [880, 0.95], [659, 1.33]].forEach(([f, at]) => this.beep(f, at, 0.32, 0.11));
    }, 3000);
    try { navigator.vibrate?.([450, 250, 450]); } catch {}
    this.vib = setInterval(() => { try { navigator.vibrate?.([450, 250, 450]); } catch {} }, 3000);
  }
  /** Исходящий: длинный гудок «вызываем». */
  back() {
    this.loop(() => this.beep(425, 0, 1.0, 0.07), 4000);
  }
  /** Короткие гудки «звонок завершён». */
  end() {
    this.stop();
    this.beep(425, 0, 0.16, 0.08);
    this.beep(425, 0.26, 0.16, 0.08);
  }
  stop() {
    clearInterval(this.timer);
    clearInterval(this.vib);
    this.timer = this.vib = null;
    try { navigator.vibrate?.(0); } catch {}
  }
}

/** Ждём, пока браузер соберёт кандидатов ICE (но не дольше GATHER_MS; после первого «реального» кандидата — ещё чуть-чуть). */
function gatherComplete(pc: RTCPeerConnection): Promise<void> {
  return new Promise((resolve) => {
    if (pc.iceGatheringState === "complete") return resolve();
    let idle: any = null;
    const done = () => {
      clearTimeout(cap);
      clearTimeout(idle);
      pc.removeEventListener("icegatheringstatechange", onState);
      pc.removeEventListener("icecandidate", onCand);
      resolve();
    };
    const cap = setTimeout(done, GATHER_MS);
    const onState = () => { if (pc.iceGatheringState === "complete") done(); };
    const onCand = (e: RTCPeerConnectionIceEvent) => {
      if (!e.candidate) return done();
      if (/ typ (srflx|relay) /.test(e.candidate.candidate) && !idle) idle = setTimeout(done, 700);
    };
    pc.addEventListener("icegatheringstatechange", onState);
    pc.addEventListener("icecandidate", onCand);
  });
}

const micMessage = (e: any) => {
  const n = e?.name;
  if (n === "NotAllowedError" || n === "SecurityError") return "Нет доступа к микрофону. Разреши его в настройках браузера.";
  if (n === "NotFoundError") return "Микрофон не найден.";
  if (n === "NotReadableError") return "Микрофон занят другим приложением.";
  return "Не удалось включить микрофон.";
};

export function CallProvider({ me, chats, onOpenChat, children }: { me: string; chats: MChat[]; onOpenChat: (chatId: string) => void; children: ReactNode }) {
  const { toast } = useToast();
  const music = useMusic();
  const musicRef = useRef(music);
  musicRef.current = music;

  const [view, setViewState] = useState<View | null>(null);
  const viewRef = useRef<View | null>(null);
  const setView = (v: View | null) => { viewRef.current = v; setViewState(v); };
  const patch = useCallback((p: Partial<View>) => {
    if (!viewRef.current) return;
    const next = { ...viewRef.current, ...p };
    viewRef.current = next;
    setViewState(next);
  }, []);

  const tones = useMemo(() => new Tones(), []);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const timers = useRef<{ ring?: any; conn?: any; beat?: any; drop?: any; clear?: any }>({});
  const abortRef = useRef(false); // нажали «отбой», пока звонок ещё готовился
  const answerSet = useRef(false);
  const seen = useRef(new Set<string>());
  const chatsRef = useRef(chats);
  const tokenRef = useRef<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const available = typeof window !== "undefined" && typeof RTCPeerConnection !== "undefined" && !!navigator.mediaDevices?.getUserMedia;

  useEffect(() => setTarget(document.getElementById("mx-root")), []);

  // секундомер на экране звонка
  const connected = view?.phase === "connected";
  useEffect(() => {
    if (!connected) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [connected]);

  const clearTimers = () => {
    Object.values(timers.current).forEach((t) => clearTimeout(t));
    clearInterval(timers.current.beat);
    timers.current = {};
  };

  const teardown = useCallback(() => {
    clearTimers();
    tones.stop();
    try { pcRef.current?.close(); } catch {}
    pcRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (audioRef.current) audioRef.current.srcObject = null;
    answerSet.current = false;
  }, [tones]);

  /** Закрыть звонок и показать подпись («Звонок завершён · 2:13») на 1.8 с. */
  const finish = useCallback((note: string, opts: { tone?: boolean; silent?: boolean } = {}) => {
    teardown();
    if (opts.tone) tones.end();
    if (opts.silent || !viewRef.current) { setView(null); return; }
    patch({ phase: "ended", note, minimized: false });
    timers.current.clear = setTimeout(() => setView(null), 1800);
  }, [teardown, tones, patch]);

  const durationNote = () => {
    const v = viewRef.current;
    return v?.since ? `Звонок завершён · ${formatDuration((Date.now() - v.since) / 1000)}` : "Звонок завершён";
  };

  const endOnServer = (reason: string) => {
    const v = viewRef.current;
    if (v?.callId) mApi("call", { action: "end", chatId: v.chatId, callId: v.callId, reason }).catch(() => {});
  };

  const failCall = useCallback((msg?: string) => {
    const v = viewRef.current;
    if (!v || v.phase === "ended") return;
    endOnServer("failed");
    toast("error", msg ?? "Не удалось соединиться. Возможно, сеть блокирует прямое соединение.");
    finish(v.since ? "Связь потеряна" : "Не удалось соединиться", { tone: true });
  }, [finish, toast]); // eslint-disable-line react-hooks/exhaustive-deps

  const startBeat = () => {
    clearInterval(timers.current.beat);
    timers.current.beat = setInterval(() => {
      const v = viewRef.current;
      if (!v?.callId) return;
      mApi<{ live?: boolean }>("call", { action: "beat", chatId: v.chatId, callId: v.callId })
        .then((r) => { if (r.live === false && viewRef.current?.callId === v.callId) finish(durationNote(), { tone: true }); })
        .catch(() => {});
    }, 20_000);
  };

  const pauseMusic = () => { const m = musicRef.current; if (m.playing) m.toggle(); };

  /** Создаёт соединение: микрофон, ICE-серверы с сервера, обработчики состояния. */
  const setup = async (): Promise<RTCPeerConnection> => {
    const [stream, ice] = await Promise.all([
      navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false }).catch((e) => { throw Object.assign(new Error(micMessage(e)), { mic: true }); }),
      mApi<{ iceServers: RTCIceServer[] }>("call"),
    ]);
    if (abortRef.current) { stream.getTracks().forEach((t) => t.stop()); throw Object.assign(new Error("aborted"), { aborted: true }); }
    tokenRef.current = (await auth.currentUser?.getIdToken().catch(() => null)) ?? null;
    streamRef.current = stream;
    if (viewRef.current?.muted) stream.getAudioTracks().forEach((t) => (t.enabled = false));
    const pc = new RTCPeerConnection({ iceServers: ice.iceServers, bundlePolicy: "max-bundle" });
    pcRef.current = pc;
    stream.getTracks().forEach((t) => pc.addTrack(t, stream));
    pc.ontrack = (e) => {
      const a = audioRef.current;
      if (!a) return;
      a.srcObject = e.streams[0] ?? new MediaStream([e.track]);
      a.play().catch(() => {});
    };
    pc.addEventListener("iceconnectionstatechange", () => {
      if (pcRef.current !== pc) return;
      const s = pc.iceConnectionState;
      if (s === "connected" || s === "completed") {
        clearTimeout(timers.current.conn);
        clearTimeout(timers.current.drop);
        if (viewRef.current?.phase !== "connected") {
          tones.stop();
          patch({ phase: "connected", since: Date.now(), weak: false });
          startBeat();
        } else patch({ weak: false });
      } else if (s === "disconnected") {
        patch({ weak: true });
        clearTimeout(timers.current.drop);
        timers.current.drop = setTimeout(() => { if (pcRef.current === pc && pc.iceConnectionState !== "connected" && pc.iceConnectionState !== "completed") failCall("Связь потеряна"); }, 8000);
      } else if (s === "failed") failCall();
    });
    return pc;
  };

  const armConnectTimer = () => {
    clearTimeout(timers.current.conn);
    timers.current.conn = setTimeout(() => { if (viewRef.current?.phase === "connecting") failCall(); }, CONNECT_MS);
  };

  // ---- исходящий ----
  const start = useCallback(async (chatId: string) => {
    if (viewRef.current) return;
    if (!available) { toast("error", "Этот браузер не поддерживает звонки."); return; }
    const chat = chatsRef.current.find((c) => c.id === chatId);
    const peer = chat?.members.find((m) => m !== me);
    if (!chat || !peer) return;
    abortRef.current = false;
    answerSet.current = false;
    setView({ phase: "calling", chatId, peerUid: peer, callId: null, dir: "out", muted: false, minimized: false, since: null, weak: false, note: "" });
    pauseMusic();
    tones.back(); // тоны запускаем сразу — это ещё внутри жеста нажатия, поэтому звук не заблокируют
    try {
      const pc = await setup();
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await gatherComplete(pc);
      if (abortRef.current) throw Object.assign(new Error("aborted"), { aborted: true });
      const res = await mApi<{ callId: string }>("call", { action: "start", chatId, offer: pc.localDescription!.sdp });
      patch({ callId: res.callId });
      if (abortRef.current) { mApi("call", { action: "end", chatId, callId: res.callId, reason: "cancelled" }).catch(() => {}); return; } // нажали «отбой», пока звонок готовился
      timers.current.ring = setTimeout(() => {
        if (viewRef.current?.phase !== "calling") return;
        endOnServer("missed");
        finish("Нет ответа", { tone: true });
      }, RING_OUT_MS);
    } catch (e: any) {
      if (e?.aborted) return;
      toast("error", e?.message || "Не удалось позвонить");
      finish("", { silent: true });
    }
  }, [available, me, toast, finish, patch]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- входящий ----
  const onIncoming = (chat: MChat, callId: string, from: string) => {
    abortRef.current = false;
    answerSet.current = false;
    setView({ phase: "incoming", chatId: chat.id, peerUid: from, callId, dir: "in", muted: false, minimized: false, since: null, weak: false, note: "" });
    tones.ring();
    clearTimeout(timers.current.ring);
    timers.current.ring = setTimeout(() => { if (viewRef.current?.phase === "incoming" && viewRef.current.callId === callId) finish("", { silent: true }); }, RING_IN_MS);
  };

  const accept = useCallback(async () => {
    const v = viewRef.current;
    if (!v || v.phase !== "incoming" || !v.callId) return;
    const call = callOf(chatsRef.current.find((c) => c.id === v.chatId));
    if (!call || call.id !== v.callId || call.status !== "ringing" || !call.offer) { finish("Звонок уже завершён"); return; }
    clearTimeout(timers.current.ring);
    tones.stop();
    patch({ phase: "connecting" });
    pauseMusic();
    abortRef.current = false;
    try {
      const pc = await setup();
      await pc.setRemoteDescription({ type: "offer", sdp: call.offer });
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await gatherComplete(pc);
      if (abortRef.current) throw Object.assign(new Error("aborted"), { aborted: true });
      await mApi("call", { action: "answer", chatId: v.chatId, callId: v.callId, answer: pc.localDescription!.sdp });
      armConnectTimer();
    } catch (e: any) {
      if (e?.aborted) return;
      toast("error", e?.status === 409 ? "Звонок уже завершён" : e?.message || "Не удалось ответить");
      if (e?.status !== 409) endOnServer("failed");
      finish("", { silent: true });
    }
  }, [finish, patch, toast]); // eslint-disable-line react-hooks/exhaustive-deps

  const hangup = useCallback(() => {
    const v = viewRef.current;
    if (!v || v.phase === "ended") return;
    abortRef.current = true;
    endOnServer(v.phase === "incoming" ? "declined" : v.phase === "calling" ? "cancelled" : "hangup");
    if (v.phase === "incoming") finish("", { silent: true });
    else finish(v.phase === "connected" ? durationNote() : "Звонок отменён", { tone: true });
  }, [finish]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleMute = () => {
    const v = viewRef.current;
    if (!v) return;
    const muted = !v.muted;
    streamRef.current?.getAudioTracks().forEach((t) => (t.enabled = !muted));
    patch({ muted });
  };

  // ---- состояние звонка приходит вместе с чатами ----
  useEffect(() => {
    chatsRef.current = chats;
    const v = viewRef.current;
    if (v?.callId) {
      const call = callOf(chats.find((c) => c.id === v.chatId));
      if (call && call.id === v.callId && v.phase !== "ended") {
        if (call.status === "ended") {
          if (v.phase === "incoming") finish(call.endReason === "missed" || call.endReason === "cancelled" ? "Пропущенный звонок" : "", { silent: true });
          else if (v.phase === "connected" || v.phase === "connecting") finish(durationNote(), { tone: true });
          else finish(call.endReason === "declined" ? "Звонок отклонён" : call.endReason === "busy" ? "Абонент занят" : "Звонок завершён", { tone: true });
        } else if (v.dir === "in" && v.phase === "incoming" && call.status === "active") {
          finish("", { silent: true }); // ответили на другом устройстве
        } else if (v.dir === "out" && call.status === "active" && call.answer && !answerSet.current && pcRef.current) {
          answerSet.current = true;
          tones.stop();
          clearTimeout(timers.current.ring);
          patch({ phase: "connecting" });
          pcRef.current.setRemoteDescription({ type: "answer", sdp: call.answer }).then(armConnectTimer).catch(() => failCall());
        }
      }
    }
    // новые входящие
    for (const chat of chats) {
      const c = callOf(chat);
      if (!c || c.to !== me || c.status !== "ringing" || seen.current.has(c.id)) continue;
      if (Math.abs(Date.now() - c.startedAt) > FRESH_MS) { seen.current.add(c.id); continue; }
      seen.current.add(c.id);
      if (viewRef.current) mApi("call", { action: "end", chatId: chat.id, callId: c.id, reason: "busy" }).catch(() => {}); // уже разговариваем
      else onIncoming(chat, c.id, c.from);
    }
  }, [chats, me]); // eslint-disable-line react-hooks/exhaustive-deps

  // закрыли вкладку во время звонка — по возможности сообщаем собеседнику
  useEffect(() => {
    const bye = () => {
      const v = viewRef.current;
      if (!v?.callId || v.phase === "ended" || !tokenRef.current) return;
      try {
        fetch("/api/messenger/call", {
          method: "POST",
          keepalive: true,
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenRef.current}`, "X-Miligram-Device": getDeviceId() },
          body: JSON.stringify({ action: "end", chatId: v.chatId, callId: v.callId, reason: v.phase === "incoming" ? "declined" : v.phase === "calling" ? "cancelled" : "hangup" }),
        });
      } catch {}
    };
    window.addEventListener("pagehide", bye);
    return () => window.removeEventListener("pagehide", bye);
  }, []);

  useEffect(() => () => teardown(), [teardown]);

  const api = useMemo<CallApi>(() => ({ available, busy: !!view, start }), [available, view, start]);
  const peer = useLiveAccount(view?.peerUid ?? null);

  return (
    <Ctx.Provider value={api}>
      {children}
      <audio ref={audioRef} autoPlay playsInline style={{ display: "none" }} />
      {target && view && createPortal(
        view.minimized && view.phase !== "incoming" && view.phase !== "ended" ? (
          <CallPill view={view} now={now} onOpen={() => patch({ minimized: false })} onHangup={hangup} />
        ) : (
          <CallScreen
            view={view}
            now={now}
            name={peer?.displayName ?? "…"}
            photo={peer?.photoURL ?? null}
            onAccept={accept}
            onHangup={hangup}
            onMute={toggleMute}
            onMinimize={() => patch({ minimized: true })}
            onChat={() => { patch({ minimized: true }); onOpenChat(view.chatId); }}
          />
        ),
        target
      )}
    </Ctx.Provider>
  );
}

// ---- Интерфейс ----

const CALL_CSS = `
@keyframes mx-call-in { from { opacity: 0; transform: scale(1.03); } to { opacity: 1; transform: none; } }
@keyframes mx-call-ring { 0% { transform: scale(1); opacity: 0.45; } 100% { transform: scale(1.75); opacity: 0; } }
@keyframes mx-call-shake { 0%, 100% { transform: rotate(0); } 15% { transform: rotate(-14deg); } 30% { transform: rotate(12deg); } 45% { transform: rotate(-9deg); } 60% { transform: rotate(7deg); } 75% { transform: rotate(0); } }
@keyframes mx-call-pill { from { opacity: 0; transform: translate(-50%, -12px); } to { opacity: 1; transform: translate(-50%, 0); } }
.mx-call { animation: mx-call-in 0.28s cubic-bezier(0.2, 0.9, 0.25, 1) both; }
.mx-call-avatar { position: relative; }
.mx-call-avatar .r { position: absolute; inset: 0; border-radius: 50%; background: var(--mx-accent); animation: mx-call-ring 2.4s ease-out infinite; pointer-events: none; }
.mx-call-avatar .r:nth-child(2) { animation-delay: 0.8s; }
.mx-call-avatar .r:nth-child(3) { animation-delay: 1.6s; }
.mx-call-btn { width: 66px; height: 66px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; color: #fff; background: rgba(255, 255, 255, 0.16); transition: transform 0.12s, background 0.15s; -webkit-tap-highlight-color: transparent; }
.mx-call-btn:active { transform: scale(0.92); }
.mx-call-btn.on { background: #fff; color: #1b1b20; }
.mx-call-btn.red { background: #e5484d; }
.mx-call-btn.green { background: #2fb36a; }
.mx-call-btn.big { width: 76px; height: 76px; }
.mx-call-shake { animation: mx-call-shake 1.4s ease-in-out infinite; transform-origin: 50% 70%; }
.mx-call-pill { position: absolute; left: 50%; top: calc(env(safe-area-inset-top) + 74px); transform: translateX(-50%); z-index: 118; animation: mx-call-pill 0.25s ease-out both; }
@media (prefers-reduced-motion: reduce) { .mx-call, .mx-call-avatar .r, .mx-call-shake, .mx-call-pill { animation: none; } }
`;

function statusText(v: View, now: number): string {
  if (v.phase === "incoming") return "Входящий голосовой звонок";
  if (v.phase === "calling") return "Вызываем…";
  if (v.phase === "connecting") return "Соединение…";
  if (v.phase === "ended") return v.note;
  const t = formatDuration(Math.max(0, (now - (v.since ?? now)) / 1000));
  return v.weak ? `${t} · плохая связь` : t;
}

function CallScreen({ view, now, name, photo, onAccept, onHangup, onMute, onMinimize, onChat }: {
  view: View; now: number; name: string; photo: string | null;
  onAccept: () => void; onHangup: () => void; onMute: () => void; onMinimize: () => void; onChat: () => void;
}) {
  const pulsing = view.phase === "incoming" || view.phase === "calling" || view.phase === "connecting";
  const ended = view.phase === "ended";
  return (
    <div className="mx-call absolute inset-0 flex flex-col items-center text-white overflow-hidden" style={{ zIndex: 125, background: "#0b0b10" }} role="dialog" aria-label="Звонок">
      <style>{CALL_CSS}</style>
      {photo && <img src={photo} alt="" aria-hidden className="absolute inset-0 w-full h-full object-cover" style={{ filter: "blur(46px) brightness(0.42) saturate(1.3)", transform: "scale(1.35)" }} />}
      <div className="absolute inset-0" style={{ background: photo ? "linear-gradient(180deg, rgba(0,0,0,0.25), rgba(0,0,0,0.6))" : "linear-gradient(165deg, color-mix(in srgb, var(--mx-accent) 38%, #0b0b10) 0%, #0b0b10 70%)" }} />

      <div className="relative w-full flex items-center justify-between px-3" style={{ paddingTop: "calc(env(safe-area-inset-top) + 12px)" }}>
        {view.phase === "incoming" || ended ? <span className="w-11" /> : (
          <button onClick={onMinimize} className="mx-call-btn" style={{ width: 44, height: 44 }} aria-label="Свернуть"><ChevronDown size={24} /></button>
        )}
        <span className="text-[13px] opacity-75 tracking-wide">MiliGram · голосовой звонок</span>
        <span className="w-11" />
      </div>

      <div className="relative flex-1 flex flex-col items-center justify-center gap-5 px-6 min-h-0 w-full">
        <div className="mx-call-avatar" style={{ width: 152, height: 152 }}>
          {pulsing && <><span className="r" /><span className="r" /><span className="r" /></>}
          <div className="relative rounded-full overflow-hidden" style={{ width: 152, height: 152, boxShadow: "0 18px 50px rgba(0,0,0,0.5)" }}>
            <Avatar src={photo} name={name} seed={view.peerUid} size={152} />
          </div>
        </div>
        <div className="text-center max-w-full">
          <p className="text-[28px] font-bold leading-tight truncate">{name}</p>
          <p className="text-[16px] mt-1.5 tabular-nums" style={{ opacity: 0.82, color: view.weak ? "#ffb74d" : undefined }}>{statusText(view, now)}</p>
        </div>
      </div>

      <div className="relative w-full flex items-start justify-center gap-9" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 38px)", minHeight: 150 }}>
        {ended ? null : view.phase === "incoming" ? (
          <>
            <Labeled label="Отклонить"><button onClick={onHangup} className="mx-call-btn red big" aria-label="Отклонить"><PhoneOff size={30} /></button></Labeled>
            <Labeled label="Принять"><button onClick={onAccept} className="mx-call-btn green big" aria-label="Принять"><span className="mx-call-shake inline-flex"><Phone size={30} /></span></button></Labeled>
          </>
        ) : (
          <>
            <Labeled label={view.muted ? "Включить" : "Выкл. микрофон"}>
              <button onClick={onMute} className={`mx-call-btn${view.muted ? " on" : ""}`} aria-label={view.muted ? "Включить микрофон" : "Выключить микрофон"} aria-pressed={view.muted}>{view.muted ? <MicOff size={26} /> : <Mic size={26} />}</button>
            </Labeled>
            <Labeled label="Завершить"><button onClick={onHangup} className="mx-call-btn red big" aria-label="Завершить звонок"><PhoneOff size={30} /></button></Labeled>
            <Labeled label="В чат"><button onClick={onChat} className="mx-call-btn" aria-label="Открыть чат"><MessageCircle size={26} /></button></Labeled>
          </>
        )}
      </div>
    </div>
  );
}

function Labeled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2" style={{ width: 84 }}>
      {children}
      <span className="text-[12.5px] opacity-80 text-center leading-tight">{label}</span>
    </div>
  );
}

/** Свёрнутый звонок: плашка над чатом — тап возвращает на экран звонка. */
function CallPill({ view, now, onOpen, onHangup }: { view: View; now: number; onOpen: () => void; onHangup: () => void }) {
  return (
    <div className="mx-call-pill flex items-center rounded-full overflow-hidden" style={{ background: "#2fb36a", color: "#fff", boxShadow: "0 10px 28px rgba(0,0,0,0.4)" }}>
      <style>{CALL_CSS}</style>
      <button onClick={onOpen} className="flex items-center gap-2 pl-3.5 pr-3 h-10 text-[14px] font-medium tabular-nums" aria-label="Вернуться к звонку">
        <Phone size={16} /> {statusText(view, now)}
      </button>
      <button onClick={onHangup} className="w-10 h-10 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.22)" }} aria-label="Завершить звонок"><PhoneOff size={17} /></button>
    </div>
  );
}
