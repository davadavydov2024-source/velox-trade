/** Блокировка приложения: код-пароль и/или Face ID / отпечаток / Windows Hello. Хранится только на этом устройстве. */

export type LockMode = "pin" | "bio" | "both";
export interface LockConfig {
  mode: LockMode;
  salt?: string; // base64
  pinHash?: string; // base64 PBKDF2(pin, salt)
  credId?: string; // base64url id локального ключа WebAuthn (биометрия)
  timeout: number; // сек. в фоне до повторной блокировки; 0 — сразу, -1 — только при запуске
}

export const LOCK_TIMEOUTS: { v: number; label: string }[] = [
  { v: 0, label: "Сразу" },
  { v: 60, label: "Через 1 минуту" },
  { v: 300, label: "Через 5 минут" },
  { v: 3600, label: "Через 1 час" },
  { v: -1, label: "Только при запуске" },
];
export const PIN_LENGTH = 4;

const key = (uid: string) => `mx-lock:${uid}`;
const failKey = (uid: string) => `mx-lock-fail:${uid}`;

export function loadLock(uid: string): LockConfig | null {
  try {
    const raw = localStorage.getItem(key(uid));
    if (!raw) return null;
    const c = JSON.parse(raw) as LockConfig;
    return c && (c.mode === "pin" || c.mode === "bio" || c.mode === "both") ? c : null;
  } catch {
    return null;
  }
}
export function saveLock(uid: string, cfg: LockConfig | null) {
  try {
    if (cfg) localStorage.setItem(key(uid), JSON.stringify(cfg));
    else { localStorage.removeItem(key(uid)); localStorage.removeItem(failKey(uid)); }
  } catch {}
  window.dispatchEvent(new Event("mx-lock-changed"));
}
export const lockNow = () => window.dispatchEvent(new Event("mx-lock-now"));
export const hasPin = (c: LockConfig | null) => !!c && (c.mode === "pin" || c.mode === "both") && !!c.pinHash;
export const hasBio = (c: LockConfig | null) => !!c && (c.mode === "bio" || c.mode === "both") && !!c.credId;

// ---- байты ----
const b64 = (buf: ArrayBuffer | Uint8Array) => { const u = buf instanceof Uint8Array ? buf : new Uint8Array(buf); let s = ""; u.forEach((x) => (s += String.fromCharCode(x))); return btoa(s); };
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const b64url = (buf: ArrayBuffer) => b64(buf).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64url = (s: string) => unb64(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));

// ---- код-пароль ----
export function newSalt(): string { return b64(crypto.getRandomValues(new Uint8Array(16))); }
export async function hashPin(pin: string, salt: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: unb64(salt), iterations: 150_000, hash: "SHA-256" }, k, 256);
  return b64(bits);
}
export async function verifyPin(cfg: LockConfig, pin: string): Promise<boolean> {
  if (!cfg.salt || !cfg.pinHash) return false;
  return (await hashPin(pin, cfg.salt)) === cfg.pinHash;
}

// ---- защита от подбора: после каждых 5 ошибок подряд — пауза 30 с, 60 с, 120 с … (до 5 минут) ----
export function lockedUntil(uid: string): number {
  try { return (JSON.parse(localStorage.getItem(failKey(uid)) ?? "{}") as { until?: number }).until ?? 0; } catch { return 0; }
}
export function registerFail(uid: string): number {
  let n = 0;
  try { n = (JSON.parse(localStorage.getItem(failKey(uid)) ?? "{}") as { n?: number }).n ?? 0; } catch {}
  n++;
  const until = n % 5 === 0 ? Date.now() + Math.min(300, 30 * 2 ** (n / 5 - 1)) * 1000 : 0;
  try { localStorage.setItem(failKey(uid), JSON.stringify({ n, until })); } catch {}
  return until;
}
export function clearFails(uid: string) { try { localStorage.removeItem(failKey(uid)); } catch {} }

// ---- биометрия (WebAuthn, платформенный аутентификатор: Face ID, Touch ID, отпечаток, Windows Hello) ----
export async function biometricSupported(): Promise<boolean> {
  try {
    if (typeof window === "undefined" || !window.PublicKeyCredential || !navigator.credentials) return false;
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}
export async function registerBiometric(uid: string, name: string): Promise<string> {
  const cred = (await navigator.credentials.create({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: { name: "MiliGram" },
      user: { id: new TextEncoder().encode(uid).slice(0, 64), name: name || uid, displayName: name || "MiliGram" },
      pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required", residentKey: "discouraged" },
      timeout: 60_000,
      attestation: "none",
    },
  })) as PublicKeyCredential | null;
  if (!cred) throw new Error("cancelled");
  return b64url(cred.rawId);
}
/** true — человек подтвердил себя биометрией (или экранным паролем устройства), false — отмена/ошибка. */
export async function verifyBiometric(credId: string): Promise<boolean> {
  try {
    const r = await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        allowCredentials: [{ type: "public-key", id: unb64url(credId), transports: ["internal"] }],
        userVerification: "required",
        timeout: 60_000,
      },
    });
    return !!r;
  } catch {
    return false;
  }
}
