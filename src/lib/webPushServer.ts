import webpush from "web-push";
import crypto from "crypto";
import { adminDb } from "./firebaseAdmin";
import { PushCategories, DEFAULT_PUSH_CATEGORIES } from "@/types";

export type PushCategory = keyof PushCategories;

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY?.trim();

function base64UrlToBuffer(base64url: string): Buffer {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  return Buffer.from(padded, "base64");
}

/**
 * Проверяет, что публичный и приватный ключ реально одна пара на кривой P-256 (prime256v1) —
 * именно такую использует Web Push. web-push сам это не проверяет: если ключи не парные, он
 * молча подписывает JWT приватным ключом, который не соответствует заявленному публичному, —
 * и push-сервис в ответ шлёт 403 BadJwtToken. Без этой проверки понять причину невозможно,
 * потому что длины (87/43 символа) при этом остаются полностью корректными.
 */
function vapidKeysMatch(publicKeyB64: string, privateKeyB64: string): boolean {
  try {
    const privateKeyBuf = base64UrlToBuffer(privateKeyB64);
    if (privateKeyBuf.length !== 32) return false;

    const publicKeyBuf = base64UrlToBuffer(publicKeyB64);
    if (publicKeyBuf.length !== 65 || publicKeyBuf[0] !== 0x04) return false;

    const ecdh = crypto.createECDH("prime256v1");
    ecdh.setPrivateKey(privateKeyBuf);
    const derivedPublicKey = ecdh.getPublicKey(); // несжатая точка, 65 байт, начинается с 0x04

    return Buffer.compare(derivedPublicKey, publicKeyBuf) === 0;
  } catch {
    return false;
  }
}

type ConfigResult = { ok: true } | { ok: false; error: string };

let cached: ConfigResult | null = null;

function ensureConfigured(): ConfigResult {
  if (cached) return cached;

  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    cached = { ok: false, error: "VAPID-ключи не настроены на сервере (NEXT_PUBLIC_VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY)" };
    return cached;
  }

  if (VAPID_PUBLIC.length < 86 || VAPID_PUBLIC.length > 88) {
    cached = {
      ok: false,
      error: `Публичный VAPID-ключ неправильной длины: ${VAPID_PUBLIC.length} симв. (должно быть ~87). Похоже, ключ обрезался при копировании.`,
    };
    return cached;
  }

  if (VAPID_PRIVATE.length !== 43) {
    cached = {
      ok: false,
      error: `Приватный VAPID-ключ неправильной длины: ${VAPID_PRIVATE.length} симв. (должно быть 43). Похоже, ключ обрезался при копировании.`,
    };
    return cached;
  }

  if (!vapidKeysMatch(VAPID_PUBLIC, VAPID_PRIVATE)) {
    cached = {
      ok: false,
      error:
        "Публичный и приватный VAPID-ключ не являются одной парой (не подходят друг другу). Скорее всего, они " +
        "от разных генераций — например, ключ перевыпустили один раз, а второй не обновили. Нужно сгенерировать " +
        "НОВУЮ пару целиком (`npx web-push generate-vapid-keys`) и прописать оба значения заново — " +
        "NEXT_PUBLIC_VAPID_PUBLIC_KEY и VAPID_PRIVATE_KEY, не смешивая со старыми значениями.",
    };
    return cached;
  }

  webpush.setVapidDetails("mailto:support@velox-trade.example", VAPID_PUBLIC, VAPID_PRIVATE);
  cached = { ok: true };
  return cached;
}

/**
 * Подписка считается недействительной для ТЕКУЩИХ ключей сервера и должна быть удалена:
 * - 404/410 — браузер сам отписался или подписка устарела на стороне push-сервиса;
 * - 401/403 — подписка создавалась с другим (несовпадающим) публичным VAPID-ключом, чем тот,
 *   что сейчас настроен на сервере (например, ключи перевыпустили после того, как пользователь
 *   уже подписался). С текущими ключами она НИКОГДА не сработает, поэтому её удаление правильно —
 *   пользователю потребуется просто заново включить уведомления, чтобы получить новую подписку.
 */
function isDeadSubscriptionStatus(statusCode?: number): boolean {
  return statusCode === 404 || statusCode === 410 || statusCode === 401 || statusCode === 403;
}

interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

/**
 * Рассылка ВСЕМ подписанным пользователям сразу — для админских рассылок (см. /admin/notifications).
 * Считается категорией "news" — уважает отключённую пользователем категорию "Новости и объявления".
 * В отличие от sendWebPush (один uid), тут не группируем по uid — просто идём по каждой
 * сохранённой подписке. Мёртвые/несовместимые с текущими ключами подписки удаляются по ходу.
 */
export async function sendWebPushBroadcast(payload: PushPayload): Promise<{ total: number; sent: number; failed: number; lastError?: string }> {
  const config = ensureConfigured();
  if (!config.ok) return { total: 0, sent: 0, failed: 0, lastError: config.error };

  const db = adminDb();
  const snap = await db.collection("pushSubscriptions").get();
  if (snap.empty) return { total: 0, sent: 0, failed: 0 };

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  let lastError: string | undefined;
  // Небольшими пачками, чтобы не упереться в лимиты push-сервисов при большой базе подписчиков.
  const BATCH = 50;
  const docs = snap.docs;
  for (let i = 0; i < docs.length; i += BATCH) {
    const batch = docs.slice(i, i + BATCH);
    await Promise.all(
      batch.map(async (doc) => {
        const sub = doc.data() as { uid?: string; endpoint: string; keys: any };
        if (sub.uid && !(await isCategoryEnabled(sub.uid, "news"))) {
          skipped++;
          return;
        }
        try {
          await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, JSON.stringify(payload));
          sent++;
        } catch (err: any) {
          console.error("sendWebPushBroadcast error:", err?.statusCode, err?.body || err?.message);
          lastError = `${err?.statusCode ?? "?"}: ${(err?.body || err?.message || "неизвестная ошибка").toString().slice(0, 200)}`;
          if (isDeadSubscriptionStatus(err?.statusCode)) {
            await doc.ref.delete().catch(() => {});
          }
          failed++;
        }
      })
    );
  }
  return { total: docs.length - skipped, sent, failed, lastError };
}

/**
 * Шлёт push-уведомление во все браузеры пользователя (может быть несколько подписок —
 * разные устройства/браузеры). Мёртвые/несовместимые с текущими ключами подписки удаляются,
 * чтобы не копился мусор и не тратились попытки отправки впустую.
 * Уважает настройки категорий уведомлений пользователя (/profile/security) — если категория
 * выключена, push просто не отправляется, без ошибки.
 */
export async function sendWebPush(uid: string, payload: PushPayload, category: PushCategory = "messages"): Promise<void> {
  const config = ensureConfigured();
  if (!config.ok) {
    console.error("sendWebPush: пропущено —", config.error);
    return;
  }
  try {
    if (!(await isCategoryEnabled(uid, category))) return;

    const db = adminDb();
    const snap = await db.collection("pushSubscriptions").where("uid", "==", uid).get();
    if (snap.empty) return;

    await Promise.all(
      snap.docs.map(async (doc) => {
        const sub = doc.data();
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: sub.keys },
            JSON.stringify(payload)
          );
        } catch (err: any) {
          console.error("sendWebPush error:", err?.statusCode, err?.body);
          if (isDeadSubscriptionStatus(err?.statusCode)) {
            await doc.ref.delete().catch(() => {});
          }
        }
      })
    );
  } catch (err) {
    console.error("sendWebPush outer error:", err);
  }
}

/** Проверяет, включена ли у пользователя данная категория уведомлений (по умолчанию — да, у старых профилей поля нет). */
async function isCategoryEnabled(uid: string, category: PushCategory): Promise<boolean> {
  try {
    const userSnap = await adminDb().collection("users").doc(uid).get();
    const prefs = (userSnap.data()?.pushCategories as PushCategories | undefined) ?? DEFAULT_PUSH_CATEGORIES;
    return prefs[category] !== false;
  } catch (err) {
    console.error("isCategoryEnabled error:", err);
    return true; // при сбое чтения профиля лучше отправить, чем молча потерять уведомление
  }
}
