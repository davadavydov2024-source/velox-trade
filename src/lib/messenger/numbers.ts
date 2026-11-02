/**
 * Номера MiliGram: красивые «телефоны» вида +888 1234 5678 (как анонимные номера в Telegram).
 * Номер — коллекционный предмет: его выдаёт администрация, владелец может показать его в профиле, передать другому человеку и убрать.
 * Редкость считается по самому номеру: повторы цифр, последовательности, зеркальные и «двойные» номера.
 */
export const NUMBER_PREFIX = "888";
export const NUMBER_LEN = 8; // цифр после +888

export type NumberTier = "common" | "rare" | "epic" | "legendary" | "mythic";
export const NUMBER_TIERS: Record<NumberTier, { label: string; color: string }> = {
  common: { label: "Обычный", color: "#8a94a3" },
  rare: { label: "Редкий", color: "#4da3ff" },
  epic: { label: "Эпический", color: "#b36bff" },
  legendary: { label: "Легендарный", color: "#ffb400" },
  mythic: { label: "Мифический", color: "#ff5ca8" },
};

export const isValidDigits = (d: unknown): d is string => typeof d === "string" && /^\d{8}$/.test(d);
/** 12345678 → «+888 1234 5678» */
export const formatNumber = (d: string) => `+${NUMBER_PREFIX} ${d.slice(0, 4)} ${d.slice(4)}`;

/** Самая длинная серия одинаковых цифр подряд. */
function sameRun(d: string): number {
  let best = 1, cur = 1;
  for (let i = 1; i < d.length; i++) { cur = d[i] === d[i - 1] ? cur + 1 : 1; best = Math.max(best, cur); }
  return best;
}
/** Самая длинная серия цифр подряд по возрастанию (1234) или по убыванию (4321). */
function seqRun(d: string): number {
  let best = 1, up = 1, down = 1;
  for (let i = 1; i < d.length; i++) {
    const diff = Number(d[i]) - Number(d[i - 1]);
    up = diff === 1 ? up + 1 : 1;
    down = diff === -1 ? down + 1 : 1;
    best = Math.max(best, up, down);
  }
  return best;
}
const isPalindrome = (d: string) => d === d.split("").reverse().join("");

/** Уровень редкости номера и короткое объяснение, почему он такой. */
export function analyzeNumber(d: string): { tier: NumberTier; reason: string } {
  const same = sameRun(d);
  const seq = seqRun(d);
  if (same === 8) return { tier: "mythic", reason: "все цифры одинаковые" };
  if (seq === 8) return { tier: "mythic", reason: "полная последовательность" };
  if (same >= 6) return { tier: "legendary", reason: `${same} одинаковых цифр подряд` };
  if (seq >= 6) return { tier: "legendary", reason: "длинная последовательность" };
  if (d.slice(0, 4) === d.slice(4)) return { tier: "legendary", reason: "две одинаковые половины" };
  if (/^(\d)\1(\d)\2(\d)\3(\d)\4$/.test(d)) return { tier: "legendary", reason: "четыре пары цифр" };
  if (isPalindrome(d)) return { tier: "epic", reason: "зеркальный номер" };
  if (same >= 5) return { tier: "epic", reason: `${same} одинаковых цифр подряд` };
  if (seq >= 5) return { tier: "epic", reason: "последовательность из 5 цифр" };
  if (/^(\d)\1{3}(\d)\2{3}$/.test(d)) return { tier: "epic", reason: "две четвёрки" };
  if (same >= 4) return { tier: "rare", reason: "4 одинаковые цифры подряд" };
  if (seq >= 4) return { tier: "rare", reason: "последовательность из 4 цифр" };
  if (/(\d)\1\1$/.test(d)) return { tier: "rare", reason: "тройка на конце" };
  if (/000$/.test(d)) return { tier: "rare", reason: "круглый номер" };
  return { tier: "common", reason: "" };
}
export const numberTier = (d: string): NumberTier => analyzeNumber(d).tier;

/** Случайный номер из 8 цифр (rnd — [0,1); на сервере передаём crypto). */
export function randomNumber(rnd: () => number = Math.random): string {
  let s = "";
  for (let i = 0; i < NUMBER_LEN; i++) s += Math.floor(rnd() * 10);
  return s;
}

/** Случайный номер заданного уровня — для выдачи из админки. */
export function rareNumber(tier: NumberTier, rnd: () => number = Math.random): string {
  const dg = () => String(Math.floor(rnd() * 10));
  const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
  for (let tries = 0; tries < 200; tries++) {
    let d: string;
    if (tier === "mythic") d = pick([dg().repeat(8), "12345678", "87654321", "01234567", "98765432"]);
    else if (tier === "legendary") {
      const a = dg(), b = dg(), c = dg(), e = dg();
      d = pick([a + b + c + e + a + b + c + e, a + a + b + b + c + c + e + e, a.repeat(6) + b + c]);
    } else if (tier === "epic") {
      const a = dg(), b = dg(), c = dg(), e = dg();
      d = pick([a + b + c + e + e + c + b + a, a.repeat(5) + b + c + e, a.repeat(4) + b.repeat(4)]);
    } else if (tier === "rare") {
      const a = dg();
      d = pick([randomNumber(rnd).slice(0, 4) + a.repeat(4), randomNumber(rnd).slice(0, 5) + a.repeat(3), randomNumber(rnd).slice(0, 5) + "000"]);
    } else d = randomNumber(rnd);
    if (numberTier(d) === tier) return d;
  }
  return randomNumber(rnd);
}
