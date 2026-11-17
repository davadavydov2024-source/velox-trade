/**
 * Серии 🔥 в личных чатах (как в TikTok и Telegram): серия растёт на 1 за каждый день, когда ОБА собеседника написали хотя бы по одному сообщению.
 * Пропущен день — серия сгорает. Сутки считаем по московскому времени, чтобы у обоих «день» заканчивался одновременно.
 * Логика общая для сервера (обновление при отправке) и клиента (показ значка), поэтому лежит в lib.
 */
export const STREAK_TZ_OFFSET_MS = 3 * 3600_000; // Москва (UTC+3)
export const STREAK_MIN = 2; // с какого числа дней показываем значок
export const STREAK_WARN_MS = 4 * 3600_000; // за сколько до конца суток показываем ⏳
const DAY = 86400_000;

export interface ChatStreak {
  count: number; // текущая серия, дней
  last: number; // номер дня, когда серия последний раз засчитана
  best: number; // рекорд
  days: Record<string, number>; // uid -> номер дня последнего сообщения
}

export const dayOf = (ts: number): number => Math.floor((ts + STREAK_TZ_OFFSET_MS) / DAY);

/** Новое состояние серии после сообщения от uid. */
export function advanceStreak(s: ChatStreak | undefined, uid: string, other: string, now: number): ChatStreak {
  const d = dayOf(now);
  const st: ChatStreak = s ?? { count: 0, last: 0, best: 0, days: {} };
  let { count, last, best } = st;
  const days = { ...(st.days ?? {}) };
  if (count > 0 && d - last > 1) count = 0; // пропущен день — серия сгорела
  days[uid] = d;
  if (days[other] === d && last !== d) {
    count = count > 0 && d - last === 1 ? count + 1 : 1;
    last = d;
    best = Math.max(best, count);
  }
  return { count, last, best, days };
}

export type StreakState = "none" | "done" | "alive" | "warn";
export interface LiveStreak { count: number; state: StreakState; msLeft: number }

/** Что показать прямо сейчас: done — сегодня уже засчитано; alive — нужно написать оба сегодня; warn — до конца суток меньше 4 часов. */
export function liveStreak(s: ChatStreak | undefined | null, now: number): LiveStreak {
  if (!s || !(s.count >= 1)) return { count: 0, state: "none", msLeft: 0 };
  const d = dayOf(now);
  if (d - s.last > 1) return { count: 0, state: "none", msLeft: 0 }; // сгорела
  const msLeft = (d + 1) * DAY - STREAK_TZ_OFFSET_MS - now;
  if (s.last === d) return { count: s.count, state: "done", msLeft };
  return { count: s.count, state: msLeft < STREAK_WARN_MS ? "warn" : "alive", msLeft };
}
