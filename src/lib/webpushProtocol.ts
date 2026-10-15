import { createCipheriv, createECDH, createPrivateKey, hkdfSync, randomBytes, sign as cryptoSign } from "crypto";

/**
 * Стандартный Web Push (RFC 8030 + шифрование RFC 8291 aes128gcm + VAPID RFC 8292) на встроенном
 * crypto Node — без Firebase и без сторонних пакетов. Сообщение уходит напрямую в push-сервис
 * браузера (Chrome/Яндекс/Edge, Firefox, Safari) по адресу endpoint из подписки.
 */

export interface VapidConfig {
  publicKey: string; // base64url, 65 байт (несжатая точка P-256)
  privateKey: string; // base64url, 32 байта
  subject: string; // mailto:... или https://...
}

export interface PushSubscriptionData {
  endpoint: string;
  p256dh: string; // base64url
  auth: string; // base64url
}

/**
 * Claim "sub" в VAPID-подписи ОБЯЗАН быть корректным mailto:почта или https://адрес. Chrome/Яндекс (FCM)
 * на кривое значение закрывают глаза, а Apple (iPhone) отвечает 403 BadJwtToken — именно поэтому на
 * Windows уведомления шли, а на iPhone нет. Если VAPID_SUBJECT пустой или невалидный (с пробелами,
 * русскими буквами, пометками вроде «(необязательно)»), безопасно подставляем адрес сайта.
 */
export function resolveVapidSubject(): string {
  const raw = (process.env.VAPID_SUBJECT || "").trim();
  const mailtoOk = /^mailto:[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/.test(raw);
  const httpsOk = /^https:\/\/[A-Za-z0-9.-]+(:\d+)?(\/[^\s]*)?$/.test(raw);
  if (mailtoOk || httpsOk) return raw;
  return (process.env.NEXT_PUBLIC_SITE_URL || "https://velox-trade-zeta.vercel.app").trim().replace(/\/+$/, "");
}

export function getVapidConfig(): VapidConfig | null {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject: resolveVapidSubject() };
}

const b64url = (buf: Buffer | string) => Buffer.from(buf).toString("base64url");

/** Шифрование тела уведомления для конкретной подписки. opts нужен только для тестов (фиксированные ключи/соль). */
export function encryptPayload(
  plaintext: Buffer,
  p256dh: Buffer,
  authSecret: Buffer,
  opts?: { asPrivate?: Buffer; salt?: Buffer }
): Buffer {
  const ecdh = createECDH("prime256v1");
  if (opts?.asPrivate) ecdh.setPrivateKey(opts.asPrivate);
  else ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey(); // 65 байт
  const shared = ecdh.computeSecret(p256dh);

  const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0"), p256dh, asPublic]);
  const ikm = Buffer.from(hkdfSync("sha256", shared, authSecret, keyInfo, 32));
  const salt = opts?.salt ?? randomBytes(16);
  const cek = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16));
  const nonce = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12));

  const record = Buffer.concat([plaintext, Buffer.from([2])]); // 0x02 — разделитель последней записи
  const cipher = createCipheriv("aes-128-gcm", cek, nonce);
  const encrypted = Buffer.concat([cipher.update(record), cipher.final(), cipher.getAuthTag()]);

  const rs = Buffer.alloc(4);
  rs.writeUInt32BE(4096, 0);
  const header = Buffer.concat([salt, rs, Buffer.from([asPublic.length]), asPublic]);
  return Buffer.concat([header, encrypted]);
}

/** Заголовок Authorization: vapid t=<JWT>, k=<публичный ключ> для конкретного push-сервиса (aud = его origin). */
export function vapidAuthorization(endpoint: string, cfg: VapidConfig): string {
  const aud = new URL(endpoint).origin;
  const header = b64url(JSON.stringify({ typ: "JWT", alg: "ES256" }));
  const claims = b64url(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: cfg.subject }));
  const data = `${header}.${claims}`;

  const pub = Buffer.from(cfg.publicKey, "base64url");
  const priv = Buffer.from(cfg.privateKey, "base64url");
  const d = priv.length < 32 ? Buffer.concat([Buffer.alloc(32 - priv.length), priv]) : priv;
  const key = createPrivateKey({
    key: { kty: "EC", crv: "P-256", d: b64url(d), x: b64url(pub.subarray(1, 33)), y: b64url(pub.subarray(33, 65)) },
    format: "jwk",
  });
  const signature = cryptoSign("sha256", Buffer.from(data), { key, dsaEncoding: "ieee-p1363" });
  return `vapid t=${data}.${b64url(signature)}, k=${cfg.publicKey}`;
}

export interface SendResult {
  ok: boolean;
  status: number;
  /** Подписка больше не существует (404/410) — её нужно удалить. */
  gone: boolean;
  error?: string;
}

export async function sendRawWebPush(
  sub: PushSubscriptionData,
  payload: object,
  cfg: VapidConfig,
  opts?: { ttl?: number; urgency?: "very-low" | "low" | "normal" | "high" }
): Promise<SendResult> {
  const body = encryptPayload(Buffer.from(JSON.stringify(payload), "utf8"), Buffer.from(sub.p256dh, "base64url"), Buffer.from(sub.auth, "base64url"));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(sub.endpoint, {
      method: "POST",
      headers: {
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        TTL: String(opts?.ttl ?? 86400),
        Urgency: opts?.urgency ?? "high",
        Authorization: vapidAuthorization(sub.endpoint, cfg),
      },
      body: new Uint8Array(body),
      signal: controller.signal,
    });
    if (res.ok) return { ok: true, status: res.status, gone: false };
    const text = (await res.text().catch(() => "")).slice(0, 200);
    return { ok: false, status: res.status, gone: res.status === 404 || res.status === 410, error: `HTTP ${res.status}${text ? `: ${text}` : ""}` };
  } catch (err: any) {
    return { ok: false, status: 0, gone: false, error: err?.name === "AbortError" ? "таймаут push-сервиса" : String(err?.message || err).slice(0, 200) };
  } finally {
    clearTimeout(timer);
  }
}

/** Разрешённые push-сервисы: защита от SSRF — сервер не должен слать запросы на произвольные адреса из подписки. */
const ALLOWED_PUSH_HOST_SUFFIXES = [
  "googleapis.com", // Chrome, Яндекс.Браузер, Edge, Opera, Samsung (FCM)
  "push.services.mozilla.com", // Firefox
  "mozilla.com",
  "apple.com", // Safari / iOS PWA (web.push.apple.com)
  "notify.windows.com", // Edge (WNS)
  "windows.com",
  "yandex.net",
  "yandex.ru",
  "yandex.com",
];

export function isAllowedPushEndpoint(endpoint: string): boolean {
  try {
    const u = new URL(endpoint);
    if (u.protocol !== "https:" || u.port) return false;
    const host = u.hostname.toLowerCase();
    if (/^[\d.]+$/.test(host) || host.includes(":")) return false; // IP-адреса
    return ALLOWED_PUSH_HOST_SUFFIXES.some((s) => host === s || host.endsWith(`.${s}`));
  } catch {
    return false;
  }
}
