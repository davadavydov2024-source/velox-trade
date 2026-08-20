import { adminDb, adminMessaging } from "./firebaseAdmin";
import { PushCategories, DEFAULT_PUSH_CATEGORIES } from "@/types";

export type PushCategory = keyof PushCategories;

/**
 * "Мёртвый" токен — устройство отписалось, приложение удалили, токен протух и т.п.
 * FCM в этих случаях бросает messaging/registration-token-not-registered — токен больше никогда
 * не сработает, поэтому удаляем его из базы, чтобы не тратить попытки отправки впустую.
 * В отличие от старого web-push (VAPID), тут в принципе не бывает 401/403 "не та пара ключей" —
 * ключ Firebase-проекта один на всех, никакого рассинхрона публичного/приватного больше нет.
 */
function isDeadTokenError(err: any): boolean {
  const code = err?.errorInfo?.code || err?.code;
  return code === "messaging/registration-token-not-registered" || code === "messaging/invalid-registration-token";
}

function describeSendError(err: any): string {
  const code = err?.errorInfo?.code || err?.code;
  if (isDeadTokenError(err)) return `${code}: токен устарел (пользователь отключил уведомления или очистил данные сайта) и был удалён.`;
  return `${code ?? "?"}: ${(err?.message || "неизвестная ошибка").toString().slice(0, 200)}`;
}

interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

/**
 * Рассылка ВСЕМ подписанным пользователям сразу — для админских рассылок (см. /admin/notifications).
 * Считается категорией "news" — уважает отключённую пользователем категорию "Новости и объявления".
 * В отличие от sendWebPush (один uid), тут не группируем по uid — просто идём по каждому
 * сохранённому токену. Мёртвые токены удаляются по ходу.
 */
export async function sendWebPushBroadcast(payload: PushPayload): Promise<{ total: number; sent: number; failed: number; lastError?: string }> {
  const db = adminDb();
  const snap = await db.collection("pushSubscriptions").get();
  if (snap.empty) return { total: 0, sent: 0, failed: 0 };

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  let lastError: string | undefined;
  // Небольшими пачками, чтобы не упереться в лимиты при большой базе подписчиков.
  const BATCH = 50;
  const docs = snap.docs;
  for (let i = 0; i < docs.length; i += BATCH) {
    const batch = docs.slice(i, i + BATCH);
    await Promise.all(
      batch.map(async (doc) => {
        const sub = doc.data() as { uid?: string; token: string };
        if (sub.uid && !(await isCategoryEnabled(sub.uid, "news"))) {
          skipped++;
          return;
        }
        try {
          await adminMessaging().send({
            token: sub.token,
            notification: { title: payload.title, body: payload.body },
            webpush: payload.url ? { fcmOptions: { link: payload.url } } : undefined,
          });
          sent++;
        } catch (err: any) {
          console.error("sendWebPushBroadcast error:", err?.errorInfo?.code || err?.code, err?.message);
          lastError = describeSendError(err);
          if (isDeadTokenError(err)) await doc.ref.delete().catch(() => {});
          failed++;
        }
      })
    );
  }
  return { total: docs.length - skipped, sent, failed, lastError };
}

/**
 * Шлёт push-уведомление во все устройства пользователя (может быть несколько токенов —
 * разные браузеры/телефоны). Мёртвые токены удаляются, чтобы не копился мусор.
 * Уважает настройки категорий уведомлений пользователя (/profile/security) — если категория
 * выключена, push просто не отправляется, без ошибки.
 */
export async function sendWebPush(uid: string, payload: PushPayload, category: PushCategory = "messages"): Promise<void> {
  try {
    if (!(await isCategoryEnabled(uid, category))) return;

    const db = adminDb();
    const snap = await db.collection("pushSubscriptions").where("uid", "==", uid).get();
    if (snap.empty) return;

    await Promise.all(
      snap.docs.map(async (doc) => {
        const sub = doc.data() as { token: string };
        try {
          await adminMessaging().send({
            token: sub.token,
            notification: { title: payload.title, body: payload.body },
            webpush: payload.url ? { fcmOptions: { link: payload.url } } : undefined,
          });
        } catch (err: any) {
          console.error("sendWebPush error:", describeSendError(err));
          if (isDeadTokenError(err)) await doc.ref.delete().catch(() => {});
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
