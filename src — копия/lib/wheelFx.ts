/**
 * Вспомогательные штуки для анимации колеса фортуны: плавность (кубическая кривая Безье, как в CSS),
 * звуки через WebAudio (без аудиофайлов), вибрация и проверка «уменьшить анимацию».
 */

/** Аналог CSS cubic-bezier(x1, y1, x2, y2): возвращает функцию плавности t∈[0,1] → [0,1]. */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t: number) => ((ay * t + by) * t + cy) * t;
  const sampleDX = (t: number) => (3 * ax * t + 2 * bx) * t + cx;

  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const err = sampleX(t) - x;
      if (Math.abs(err) < 1e-5) return sampleY(t);
      const d = sampleDX(t);
      if (Math.abs(d) < 1e-6) break;
      t -= err / d;
    }
    // Ньютон не сошёлся — делим отрезок пополам (всегда сходится).
    let lo = 0;
    let hi = 1;
    t = x;
    for (let i = 0; i < 24; i++) {
      const v = sampleX(t);
      if (Math.abs(v - x) < 1e-5) break;
      if (x > v) lo = t;
      else hi = t;
      t = (hi - lo) / 2 + lo;
    }
    return sampleY(t);
  };
}

export const easeOutSine = (t: number) => Math.sin((t * Math.PI) / 2);
export const easeInOutSine = (t: number) => -(Math.cos(Math.PI * t) - 1) / 2;

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function vibrate(pattern: number | number[]) {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(pattern);
  } catch {
    // вибрация не поддерживается — не страшно
  }
}

/** AudioContext нужно создавать по жесту пользователя (клик «Крутить») — иначе браузер его заблокирует. */
export function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  try {
    return new AC();
  } catch {
    return null;
  }
}

function tone(ctx: AudioContext, o: { freq: number; dur: number; type?: OscillatorType; gain?: number; at?: number; slideTo?: number }) {
  const t0 = ctx.currentTime + (o.at ?? 0);
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = o.type ?? "sine";
  osc.frequency.setValueAtTime(o.freq, t0);
  if (o.slideTo) osc.frequency.exponentialRampToValueAtTime(o.slideTo, t0 + o.dur);
  const peak = o.gain ?? 0.06;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
  osc.connect(g).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + o.dur + 0.02);
}

/** Щелчок указателя о штырёк: чем быстрее крутится колесо, тем выше тон. */
export function playTick(ctx: AudioContext, speed: number) {
  tone(ctx, { freq: 620 + speed * 520 + Math.random() * 40, dur: 0.04, type: "triangle", gain: 0.05 });
}

export function playWin(ctx: AudioContext, big: boolean) {
  const notes = big ? [523.25, 659.25, 783.99, 1046.5, 1318.5] : [523.25, 659.25, 783.99, 1046.5];
  notes.forEach((f, i) => tone(ctx, { freq: f, dur: 0.32, type: "triangle", gain: 0.07, at: i * 0.09 }));
}

export function playLose(ctx: AudioContext) {
  tone(ctx, { freq: 392, dur: 0.28, type: "sawtooth", gain: 0.035, slideTo: 330 });
  tone(ctx, { freq: 294, dur: 0.42, type: "sawtooth", gain: 0.035, at: 0.22, slideTo: 196 });
}
