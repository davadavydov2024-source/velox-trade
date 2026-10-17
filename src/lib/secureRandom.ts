import { randomInt, timingSafeEqual } from "crypto";

/** 6-значный код из криптографического генератора (Math.random предсказуем и для кодов входа не годится). */
export function randomCode6(): string {
  return String(randomInt(100000, 1000000));
}

/** Случайный токен из алфавита (для ссылок/кодов привязки). */
export function randomToken(length = 20, alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789"): string {
  let out = "";
  for (let i = 0; i < length; i++) out += alphabet[randomInt(alphabet.length)];
  return out;
}

/** Сравнение строк за постоянное время — чтобы код нельзя было подбирать по времени ответа. */
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
