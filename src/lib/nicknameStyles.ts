/**
 * Пресеты оформления ника — задаются администратором на /admin/users (пользователь не может
 * поменять себе цвет/шрифт ника сам). Хранится на профиле как nameColor/nameFont (см. UserProfile
 * в types/index.ts) — просто строковые id пресетов ниже, не произвольный CSS, чтобы админ не мог
 * случайно вписать что-то, ломающее вёрстку.
 */
export interface NicknameColorPreset {
  id: string;
  label: string;
  /** Обычный сплошной цвет текста. Для неоновых пресетов это же значение используется в
   * text-shadow (см. StyledNickname) — реального "свечения" через фильтры не делаем, чтобы не
   * бить производительность на страницах со списками из многих ников. */
  color: string;
  /** Неоновые пресеты получают многослойный text-shadow тем же цветом — это и создаёт эффект
   * свечения без CSS-фильтров. */
  neon?: boolean;
}

export const NICKNAME_COLOR_PRESETS: NicknameColorPreset[] = [
  { id: "default", label: "Обычный", color: "" },
  { id: "orange", label: "Оранжевый", color: "#ff9800" },
  { id: "red", label: "Красный", color: "#f44336" },
  { id: "blue", label: "Синий", color: "#4a6cf7" },
  { id: "green", label: "Зелёный", color: "#22c55e" },
  { id: "pink", label: "Розовый", color: "#e879f9" },
  { id: "gold", label: "Золотой", color: "#fbbf24" },
  { id: "neon-cyan", label: "Неон — циан", color: "#22d3ee", neon: true },
  { id: "neon-pink", label: "Неон — розовый", color: "#f472b6", neon: true },
  { id: "neon-green", label: "Неон — зелёный", color: "#4ade80", neon: true },
  { id: "neon-purple", label: "Неон — фиолетовый", color: "#a78bfa", neon: true },
  { id: "neon-red", label: "Неон — красный", color: "#f87171", neon: true },
];

export interface NicknameFontPreset {
  id: string;
  label: string;
  /** CSS font-family; пусто — системный шрифт сайта по умолчанию (ничего не переопределяем). */
  fontFamily: string;
  /** Доп. классы начертания (жирность/курсив/разрядка) поверх font-family. */
  className?: string;
}

export const NICKNAME_FONT_PRESETS: NicknameFontPreset[] = [
  { id: "default", label: "Обычный", fontFamily: "" },
  { id: "bold", label: "Жирный", fontFamily: "", className: "font-extrabold" },
  { id: "italic", label: "Курсив", fontFamily: "", className: "italic font-semibold" },
  { id: "wide", label: "Вразрядку", fontFamily: "", className: "tracking-[0.15em] font-semibold" },
  { id: "mono", label: "Моноширинный", fontFamily: "ui-monospace, 'Courier New', monospace", className: "font-semibold" },
  { id: "serif", label: "С засечками", fontFamily: "Georgia, 'Times New Roman', serif" },
];

export function getNicknameColorPreset(id?: string) {
  return NICKNAME_COLOR_PRESETS.find((p) => p.id === id) ?? NICKNAME_COLOR_PRESETS[0];
}

export function getNicknameFontPreset(id?: string) {
  return NICKNAME_FONT_PRESETS.find((p) => p.id === id) ?? NICKNAME_FONT_PRESETS[0];
}
