import crypto from "crypto";

/**
 * Шифрование учётных данных БОТ-АККАУНТОВ, которыми владеет сама площадка (не пользователей!) —
 * нужно, чтобы админ мог вручную зайти в аккаунт-посредник в браузере и передать/принять предмет
 * от продавца/покупателю. Это НЕ автоматизация трейдов и НЕ хранение чужих (пользовательских)
 * данных — обычный сейф для собственных учётных данных площадки, как в менеджере паролей.
 *
 * AES-256-GCM: ключ берём из переменной окружения BOT_CREDENTIALS_KEY (любая строка — прогоняем
 * через sha256, чтобы получить ровно 32 байта, так что подходит ключ любой длины/формата).
 * Без этой переменной шифрование работать не будет — это осознанно: без явно заданного на сервере
 * секрета учётки ботов сохранять нельзя.
 */
function getKey(): Buffer {
  const raw = process.env.BOT_CREDENTIALS_KEY;
  if (!raw) throw new Error("BOT_CREDENTIALS_KEY не задан на сервере — шифрование учётных данных ботов недоступно");
  return crypto.createHash("sha256").update(raw).digest();
}

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // iv (12 байт) + authTag (16 байт) + ciphertext — всё одной base64-строкой для простоты хранения.
  return Buffer.concat([iv, authTag, ciphertext]).toString("base64");
}

export function decryptSecret(encoded: string): string {
  const buf = Buffer.from(encoded, "base64");
  const iv = buf.subarray(0, 12);
  const authTag = buf.subarray(12, 28);
  const ciphertext = buf.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

// ===================== TOTP (RFC 6238) для 2FA бот-аккаунтов =====================
// Roblox при включении 2FA через приложение-аутентификатор даёт секретный ключ в формате Base32
// (тот же формат, что уходит в Google Authenticator/Authy) — храним его (зашифрованным) и здесь же
// сами считаем текущий 6-значный код, чтобы админу не нужно было держать секрет ещё и в телефоне.

function base32Decode(input: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const clean = input.replace(/=+$/, "").toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = "";
  for (const char of clean) {
    const val = alphabet.indexOf(char);
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

export function generateTotpCode(base32Secret: string, forTime: number = Date.now()): string {
  const key = base32Decode(base32Secret);
  const counter = Math.floor(forTime / 1000 / 30);
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeBigUInt64BE(BigInt(counter));

  const hmac = crypto.createHmac("sha1", key).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) | ((hmac[offset + 1] & 0xff) << 16) | ((hmac[offset + 2] & 0xff) << 8) | (hmac[offset + 3] & 0xff);
  const code = (binary % 1_000_000).toString().padStart(6, "0");
  return code;
}

/** Секунд до смены текущего TOTP-кода — чтобы UI показал "код действует ещё N сек". */
export function totpSecondsRemaining(forTime: number = Date.now()): number {
  return 30 - (Math.floor(forTime / 1000) % 30);
}
