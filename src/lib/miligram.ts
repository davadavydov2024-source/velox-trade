/** Общие типы и константы MiliGram (мод Telegram) — используются и сайтом, и серверными роутами. */

export const MILIGRAM_BADGES = [
  { id: "admin", label: "Admin", color: "#c0392b" },
  { id: "developer", label: "Developer", color: "#8b6b4a" },
  { id: "moderator", label: "Moderator", color: "#6c5ce7" },
  { id: "tester", label: "Tester", color: "#2e8b57" },
  { id: "designer", label: "Designer", color: "#d6336c" },
  { id: "vip", label: "VIP", color: "#e0a800" },
] as const;

export type MiliGramBadgeId = (typeof MILIGRAM_BADGES)[number]["id"];

export interface MiliGramProfile {
  uid: string;
  tgUserId?: number; // берётся из telegramLinks (привязка Telegram на Velox), а не от клиента приложения
  badge?: MiliGramBadgeId | null;
  gradientFrom?: string | null;
  gradientTo?: string | null;
  borderColor?: string | null;
  bannerURL?: string | null;
  banned?: boolean;
  note?: string;
  linkedAt?: number;
  lastSeenAt?: number;
  appVersion?: string;
  updatedAt?: number;
}

export interface MiliGramConfig {
  flags: Record<string, boolean>;
  minVersion: string; // версии ниже получают просьбу обновиться; пусто — без ограничения
  announcement: { id: string; text: string; active: boolean };
  updatedAt?: number;
}

export const MILIGRAM_FLAG_ROWS: { key: string; label: string; hint: string }[] = [
  { key: "ghostMode", label: "Режим призрака", hint: "Не отправлять «прочитано», скрыть «печатает» и «в сети»" },
  { key: "savedDeleted", label: "Сохранять удалённые сообщения", hint: "Локально, на устройстве получателя" },
  { key: "customBubbles", label: "Свои пузыри сообщений", hint: "Цвет, стиль, прозрачность" },
  { key: "profileDecor", label: "Баннеры, бейджи и градиентные ники", hint: "Показ оформления других пользователей MiliGram" },
  { key: "veloxTab", label: "Вкладка Velox Trade в приложении", hint: "Каталог и баланс внутри MiliGram" },
  { key: "themesShop", label: "Каталог тем", hint: "Скачивание тем и палитр по ссылке" },
];

export const DEFAULT_MILIGRAM_CONFIG: MiliGramConfig = {
  flags: Object.fromEntries(MILIGRAM_FLAG_ROWS.map((r) => [r.key, true])),
  minVersion: "",
  announcement: { id: "", text: "", active: false },
};

const HEX = /^#[0-9a-fA-F]{6}$/;

function hexOrNull(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  return typeof v === "string" && HEX.test(v) ? v : undefined;
}

/** Проверяет патч оформления от админки. Бросает Error с понятным текстом при мусоре. */
export function sanitizeProfilePatch(input: any): Partial<MiliGramProfile> {
  const out: Partial<MiliGramProfile> = {};
  if ("badge" in input) {
    if (input.badge === null || input.badge === "") out.badge = null;
    else if (MILIGRAM_BADGES.some((b) => b.id === input.badge)) out.badge = input.badge;
    else throw new Error("Неизвестный бейдж");
  }
  for (const k of ["gradientFrom", "gradientTo", "borderColor"] as const) {
    if (k in input) {
      const v = hexOrNull(input[k]);
      if (v === undefined) throw new Error(`Цвет «${k}» должен быть вида #RRGGBB`);
      out[k] = v;
    }
  }
  if ("bannerURL" in input) {
    const u = input.bannerURL;
    if (u === null || u === "") out.bannerURL = null;
    else if (typeof u === "string" && u.length <= 500 && u.startsWith("https://")) out.bannerURL = u;
    else throw new Error("Баннер — ссылка https://… до 500 символов");
  }
  if ("banned" in input) out.banned = input.banned === true;
  if ("note" in input) out.note = String(input.note ?? "").slice(0, 300);
  return out;
}
