/**
 * Material You (Material 3): вся палитра строится из одного цвета-«семени».
 * Без HCT-библиотек: оттенок берём из семени, а светлоту задаём тонами 0–100, как в M3 (primary / secondary / tertiary / neutral).
 */
export const M3_DEFAULT_SEED = "#6750a4";

function hexToHsl(hex: string): [number, number, number] {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, s, l];
}

function hsl(h: number, s: number, tone: number): string {
  const l = tone / 100, a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/** Переменные темы Material You для корня мессенджера. dark — тёмная ли схема. */
export function m3Vars(seed: string, dark: boolean): Record<string, string> {
  const [h, s0] = hexToHsl(seed);
  const sp = Math.min(0.8, Math.max(0.35, s0));
  const P = (t: number) => hsl(h, sp, t);
  const S = (t: number) => hsl(h, sp * 0.35, t);
  const T = (t: number) => hsl(h + 60, sp * 0.6, t);
  const N = (t: number) => hsl(h, 0.07, t);
  const NV = (t: number) => hsl(h, 0.12, t);

  const c = dark
    ? { primary: P(80), onPrimary: P(20), primaryC: P(30), onPrimaryC: P(90), secC: S(30), onSecC: S(90), terC: T(30), onTerC: T(90), tertiary: T(80),
        bg: N(6), cont: N(12), high: N(17), highest: N(22), text: N(90), muted: NV(80), outlineV: NV(30), outline: NV(60) }
    : { primary: P(40), onPrimary: "#ffffff", primaryC: P(90), onPrimaryC: P(10), secC: S(90), onSecC: S(10), terC: T(90), onTerC: T(10), tertiary: T(40),
        bg: N(98), cont: N(94), high: N(92), highest: N(90), text: N(10), muted: NV(30), outlineV: NV(80), outline: NV(50) };

  return {
    "--mx-accent": c.primary, "--mx-accent-text": c.onPrimary,
    "--mx-bg": c.bg, "--mx-surface": c.cont, "--mx-surface2": c.high, "--mx-in": c.high,
    "--mx-out": c.primaryC, "--mx-out-text": c.onPrimaryC,
    "--mx-text": c.text, "--mx-muted": c.muted, "--mx-line": c.outlineV,
    "--mx-glass": `color-mix(in srgb, ${c.cont} 88%, transparent)`,
    "--m3-secondary-container": c.secC, "--m3-on-secondary-container": c.onSecC,
    "--m3-tertiary": c.tertiary, "--m3-tertiary-container": c.terC, "--m3-on-tertiary-container": c.onTerC,
    "--m3-surface-highest": c.highest, "--m3-outline": c.outline,
  };
}
