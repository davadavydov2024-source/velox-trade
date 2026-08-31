import { getApps, initializeApp, cert, App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { createHmac } from "crypto";

// ВАЖНО: этот файл использует секретные переменные окружения БЕЗ префикса NEXT_PUBLIC_ —
// значит они видны только на сервере (в API-роутах), никогда не попадают в клиентский бандл.
// Никогда не импортируй этот файл из компонентов с "use client".

function getAdminApp(): App {
  if (getApps().length) return getApps()[0];

  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  // Приватный ключ из Firebase хранит переносы строк как \n внутри одной строки в .env —
  // их нужно превратить обратно в реальные переносы строк.
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Firebase Admin не настроен: заполни FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL, FIREBASE_ADMIN_PRIVATE_KEY в .env.local (см. README, раздел про вход через Telegram)."
    );
  }

  return initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
  });
}

export function adminAuth() {
  return getAuth(getAdminApp());
}

export function adminDb() {
  return getFirestore(getAdminApp());
}

export function adminMessaging() {
  return getMessaging(getAdminApp());
}

/**
 * Своя капча вместо App Check/reCAPTCHA — проверяет HMAC-подписанный токен, выданный
 * api/captcha/verify после того как человек правильно ответил на простой вопрос (см.
 * lib/captcha.ts). Никаких внешних сервисов (Google/reCAPTCHA) — токен подписан секретом
 * CAPTCHA_SECRET на этом же сервере и живёт 10 минут, дольше не имеет смысла держать decode.
 */
export function verifyCaptchaToken(token: string | null): boolean {
  if (process.env.APP_CHECK_ENFORCEMENT !== "true") return true;
  if (!token) return false;
  const secret = process.env.CAPTCHA_SECRET;
  if (!secret) return true; // капча не настроена на сервере — не блокируем пользователей

  try {
    const [payloadB64, signature] = token.split(".");
    if (!payloadB64 || !signature) return false;
    const expectedSig = createHmac("sha256", secret).update(payloadB64).digest("hex");
    if (signature !== expectedSig) return false;

    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString());
    const issuedAt = payload.issuedAt as number;
    if (typeof issuedAt !== "number") return false;
    return Date.now() - issuedAt < 10 * 60 * 1000; // токен живёт 10 минут
  } catch {
    return false;
  }
}
