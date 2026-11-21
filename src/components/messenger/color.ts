/** Помощники для своих цветов оформления: любой цвет выбирается пипеткой, а читаемость текста считается сама. */
export const isHex = (s: unknown): s is string => typeof s === "string" && /^#[0-9a-fA-F]{6}$/.test(s);

const rgb = (h: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
const toHex = (c: number[]) => "#" + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");

export function luminance(h: string): number {
  const [r, g, b] = rgb(h).map((v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Цвет текста, читаемый на фоне h: тёмный на светлом, белый на тёмном. */
export const readableOn = (h: string): string => (luminance(h) > 0.45 ? "#101010" : "#ffffff");

/** Смешивает a с b: t = 0 — чистый a, t = 1 — чистый b. */
export function mixHex(a: string, b: string, t: number): string {
  const x = rgb(a), y = rgb(b);
  return toHex(x.map((v, i) => v + (y[i] - v) * t));
}

/** Переменные темы под свой цвет фона: поверхности, текст и линии подбираются автоматически. */
export function bgVars(bg: string): Record<string, string> {
  const dark = luminance(bg) < 0.4;
  const fg = dark ? "#ffffff" : "#101010";
  const toward = dark ? "#ffffff" : "#000000";
  return {
    "--mx-bg": bg,
    "--mx-surface": mixHex(bg, toward, 0.07),
    "--mx-surface2": mixHex(bg, toward, 0.13),
    "--mx-in": mixHex(bg, toward, 0.1),
    "--mx-text": fg,
    "--mx-muted": mixHex(bg, fg, 0.55),
    "--mx-line": mixHex(bg, toward, 0.16),
  };
}
