import crypto from "crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const STEP_SECONDS = 30;
const CODE_DIGITS = 6;

/** Генерирует случайный base32-секрет (160 бит — стандарт для TOTP-приложений типа Google Authenticator). */
export function generateBase32Secret(byteLength = 20): string {
  const bytes = crypto.randomBytes(byteLength);
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function hotp(secret: Buffer, counter: number): string {
  const counterBuf = Buffer.alloc(8);
  // Счётчик — 64-битное big-endian число; в JS безопасно только до 2^53, но для временных
  // окон TOTP (секунды/30) этого хватит на многие тысячелетия вперёд.
  counterBuf.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  counterBuf.writeUInt32BE(counter >>> 0, 4);

  const hmac = crypto.createHmac("sha1", secret).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const binCode =
    ((hmac[offset] & 0x7f) << 24) | ((hmac[offset + 1] & 0xff) << 16) | ((hmac[offset + 2] & 0xff) << 8) | (hmac[offset + 3] & 0xff);
  return String(binCode % 10 ** CODE_DIGITS).padStart(CODE_DIGITS, "0");
}

/** Текущий 6-значный код для секрета (пригодится только для тестов/отладки — в проде код вводит пользователь). */
export function generateTotpCode(base32Secret: string, at = Date.now()): string {
  const counter = Math.floor(at / 1000 / STEP_SECONDS);
  return hotp(base32Decode(base32Secret), counter);
}

/**
 * Проверяет 6-значный код. Разрешаем окно ±1 шаг (30 сек в каждую сторону) — компенсирует
 * небольшую рассинхронизацию часов телефона, как это принято во всех TOTP-реализациях.
 */
export function verifyTotpCode(base32Secret: string, code: string, at = Date.now(), window = 1): boolean {
  const clean = code.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(clean)) return false;
  const secretBytes = base32Decode(base32Secret);
  const counter = Math.floor(at / 1000 / STEP_SECONDS);
  for (let errorWindow = -window; errorWindow <= window; errorWindow++) {
    if (hotp(secretBytes, counter + errorWindow) === clean) return true;
  }
  return false;
}

export function buildOtpauthUrl(secret: string, accountLabel: string, issuer = "Velox Trade"): string {
  const label = encodeURIComponent(`${issuer}:${accountLabel}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&digits=${CODE_DIGITS}&period=${STEP_SECONDS}`;
}

/** Резервные коды на случай утери телефона — генерируем 10 штук вида "XXXX-XXXX". */
export function generateBackupCodes(count = 10): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const raw = crypto.randomBytes(5).toString("hex").toUpperCase(); // 10 hex-символов
    codes.push(`${raw.slice(0, 5)}-${raw.slice(5, 10)}`);
  }
  return codes;
}

export function hashBackupCode(code: string): string {
  return crypto.createHash("sha256").update(code.trim().toUpperCase()).digest("hex");
}
