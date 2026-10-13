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

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://velox-trade-zeta.vercel.app").replace(/\/+$/, "");

/**
 * FCM принимает в webpush.fcmOptions.link ТОЛЬКО абсолютный https-адрес. Раньше сюда уходили
 * относительные пути вида "/chats" или "/product/123" — Firebase отвечал INVALID_ARGUMENT, и ни
 * одно push-уведомление со ссылкой не доходило (а ссылка есть почти у всех). Здесь путь
 * превращается в полный адрес сайта; чужие домены отбрасываются — в push нельзя вставить
 * ссылку на посторонний сайт.
 */
export function toAbsoluteLink(url?: string): string | undefined {
  if (!url || typeof url !== "string") return undefined;
  const u = url.trim();
  if (!u) return undefined;
  if (u.startsWith("/") && !u.startsWith("//")) return `${SITE_URL}${u}`;
  try {
    const parsed = new URL(u);
    if (parsed.origin === new URL(SITE_URL).origin) return parsed.toString();
  } catch {
    // не URL — игнорируем ссылку, само уведомление всё равно отправится
  }
  return undefined;
}

/**
 * Единое тело сообщения для всех отправок. Сообщение DATA-ONLY (без поля notification): показом
 * уведомления целиком занимается наш service worker (public/firebase-messaging-sw.js) в событии
 * "push" — так поведение одинаково во всех браузерах, ссылка по клику всегда открывается, и не
 * зависит от того, подгрузился ли Firebase SDK внутри SW. Все значения data обязаны быть строками.
 */
function buildMessage(token: string, payload: PushPayload) {
  const link = toAbsoluteLink(payload.url);
  return {
    token,
    data: {
      title: payload.title.slice(0, 120),
      body: payload.body.slice(0, 300),
      icon: `${SITE_URL}/icons/icon-192.png`,
      ...(link ? { url: link } : {}),
    },
    webpush: {
      headers: { Urgency: "high", TTL: "86400" },
    },
  };
}

export interface PushSendReport {
  devices: number;
  sent: number;
  failed: number;
  errors: string[];
}

/** Как sendWebPush, но без проверки категорий и с подробным отчётом — для кнопки «Тест» в профиле. */
export async function sendWebPushDetailed(uid: string, payload: PushPayload): Promise<PushSendReport> {
  const snap = await adminDb().collection("pushSubscriptions").where("uid", "==", uid).get();
  const report: PushSendReport = { devices: snap.size, sent: 0, failed: 0, errors: [] };
  await Promise.all(
    snap.docs.map(async (doc) => {
      const sub = doc.data() as { token?: string };
      if (!sub.token) {
        await doc.ref.delete().catch(() => {});
        return;
      }
      try {
        await adminMessaging().send(buildMessage(sub.token, payload));
        report.sent++;
      } catch (err: any) {
        report.failed++;
        report.errors.push(describeSendError(err));
        if (isDeadTokenError(err)) await doc.ref.delete().catch(() => {});
      }
    })
  );
  return report;
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
  const BATCH = 50;
  const docs = snap.docs;
  for (let i = 0; i < docs.length; i += BATCH) {
    const batch = docs.slice(i, i + BATCH);
    await Promise.all(
      batch.map(async (doc) => {
        const sub = doc.data() as { uid?: string; token?: string };
        if (!sub.token) {
          await doc.ref.delete().catch(() => {});
          skipped++;
          return;
        }
        if (sub.uid && !(await isCategoryEnabled(sub.uid, "news"))) {
          skipped++;
          return;
        }
        try {
          await adminMessaging().send(buildMessage(sub.token, payload));
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
        const sub = doc.data() as { token?: string };
        if (!sub.token) {
          await doc.ref.delete().catch(() => {});
          return;
        }
        try {
          await adminMessaging().send(buildMessage(sub.token, payload));
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
    return true;
  }
}
