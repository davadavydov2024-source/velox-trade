import webpush from "web-push";
import { adminDb } from "./firebaseAdmin";

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;

let configured = false;
function ensureConfigured() {
  if (configured) return true;
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return false;
  webpush.setVapidDetails("mailto:support@velox-trade.example", VAPID_PUBLIC, VAPID_PRIVATE);
  configured = true;
  return true;
}

interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

/**
 * Рассылка ВСЕМ подписанным пользователям сразу — для админских рассылок (см. /admin/notifications).
 * В отличие от sendWebPush (один uid), тут не группируем по uid — просто идём по каждой
 * сохранённой подписке. Мёртвые подписки (404/410) удаляются по ходу, как и в sendWebPush.
 */
export async function sendWebPushBroadcast(payload: PushPayload): Promise<{ total: number; sent: number; failed: number }> {
  if (!ensureConfigured()) return { total: 0, sent: 0, failed: 0 };
  const db = adminDb();
  const snap = await db.collection("pushSubscriptions").get();
  if (snap.empty) return { total: 0, sent: 0, failed: 0 };

  let sent = 0;
  let failed = 0;
  // Небольшими пачками, чтобы не упереться в лимиты push-сервисов при большой базе подписчиков.
  const BATCH = 50;
  const docs = snap.docs;
  for (let i = 0; i < docs.length; i += BATCH) {
    const batch = docs.slice(i, i + BATCH);
    await Promise.all(
      batch.map(async (doc) => {
        const sub = doc.data();
        try {
          await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, JSON.stringify(payload));
          sent++;
        } catch (err: any) {
          if (err?.statusCode === 404 || err?.statusCode === 410) {
            await doc.ref.delete().catch(() => {});
          }
          failed++;
        }
      })
    );
  }
  return { total: docs.length, sent, failed };
}

/**
 * Шлёт push-уведомление во все браузеры пользователя (может быть несколько подписок —
 * разные устройства/браузеры). Мёртвые подписки (браузер отписался/данные устарели — код 404/410)
 * тихо удаляются, чтобы не копился мусор и не тратились попытки отправки впустую.
 */
export async function sendWebPush(uid: string, payload: PushPayload): Promise<void> {
  if (!ensureConfigured()) return; // VAPID-ключи не настроены — push просто не шлём, без ошибок
  try {
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
          if (err?.statusCode === 404 || err?.statusCode === 410) {
            await doc.ref.delete().catch(() => {});
          } else {
            console.error("sendWebPush error:", err?.statusCode, err?.body);
          }
        }
      })
    );
  } catch (err) {
    console.error("sendWebPush outer error:", err);
  }
}
