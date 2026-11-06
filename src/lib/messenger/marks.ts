/** Метки и галочки MiliGram: их выдаёт админ любому человеку и каналу (как верификация в Telegram). */
export const VERIFY_KINDS = [
  { id: "verified", label: "Подтверждённый", color: "#3390ec", desc: "Этот аккаунт подтверждён администрацией MiliGram." },
  { id: "official", label: "Официальный", color: "#7d8a99", desc: "Официальный аккаунт: подтверждён представителями MiliGram." },
  { id: "major", label: "Major", color: "#f5a623", desc: "Major — крупный проверенный аккаунт: личность и значимость подтверждены." },
  { id: "trusted", label: "Доверенный", color: "#34c759", desc: "Доверенный аккаунт: деятельность проверена администрацией MiliGram." },
] as const;
export type VerifyKind = (typeof VERIFY_KINDS)[number]["id"];
export const isVerifyKind = (v: unknown): v is VerifyKind => VERIFY_KINDS.some((k) => k.id === v);
export const verifyMeta = (kind?: string | null) => VERIFY_KINDS.find((k) => k.id === kind) ?? VERIFY_KINDS[0];
export const TAG_MAX = 16;
/** Какая галочка у человека/канала: явно выбранный вид, либо обычная «Подтверждённый» (старый флаг verified), либо нет. */
export function markKind(o?: { verified?: boolean; verifyKind?: string | null } | null): VerifyKind | null {
  if (!o) return null;
  if (isVerifyKind(o.verifyKind)) return o.verifyKind;
  return o.verified ? "verified" : null;
}

/** Что означает метка рядом с именем (показывается по нажатию). Админ может задать своё описание — оно главнее. */
const TAG_DESCRIPTIONS: Record<string, string> = {
  CEO: "Генеральный директор — руководитель MiliGram.",
  CTO: "Технический директор — отвечает за технологии MiliGram.",
  FOUNDER: "Основатель MiliGram.",
  ОСНОВАТЕЛЬ: "Основатель MiliGram.",
  DEV: "Разработчик — создаёт и поддерживает MiliGram.",
  ADMIN: "Администратор — управляет платформой и следит за порядком.",
  MOD: "Модератор — следит за соблюдением правил и помогает пользователям.",
  SUPPORT: "Поддержка — поможет с вопросами и проблемами.",
  DESIGN: "Дизайнер — отвечает за внешний вид MiliGram.",
  QA: "Тестировщик — проверяет, что всё работает без ошибок.",
  PR: "Представитель по связям с общественностью MiliGram.",
  PARTNER: "Партнёр MiliGram.",
  BOT: "Автоматический аккаунт MiliGram.",
  VIP: "VIP — особый статус от администрации MiliGram.",
};
export function tagInfo(tag: string, custom?: string | null): string {
  return custom?.trim() || TAG_DESCRIPTIONS[tag.trim().toUpperCase()] || "Метка выдана администрацией MiliGram.";
}
