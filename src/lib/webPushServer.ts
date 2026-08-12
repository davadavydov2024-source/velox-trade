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
export async function sendWebPushBroadcast(payload: PushPayload): Promise<{ total: number; sent: number; failed: number; lastError?: string }> {
  if (!ensureConfigured()) return { total: 0, sent: 0, failed: 0, lastError: "VAPID-ключи не настроены на сервере" };
  const db = adminDb();
  const snap = await db.collection("pushSubscriptions").get();
  if (snap.empty) return { total: 0, sent: 0, failed: 0 };

  let sent = 0;
  let failed = 0;
  let lastError: string | undefined;
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
          // Раньше эта ошибка нигде не логировалась и не долетала до админки — из-за этого
          // было невозможно понять, реально ли подписка протухла (404/410) или дело в чём-то
          // другом (например, рассинхронизации VAPID-ключей — тогда придёт 401/403, и подписка
          // на самом деле рабочая, просто сервер подписывает её не тем ключом).
          console.error("sendWebPushBroadcast error:", err?.statusCode, err?.body || err?.message);
          lastError = `${err?.statusCode ?? "?"}: ${(err?.body || err?.message || "неизвестная ошибка").toString().slice(0, 200)}`;
          if (err?.statusCode === 404 || err?.statusCode === 410) {
            await doc.ref.delete().catch(() => {});
          }
          failed++;
        }
      })
    );
  }
  if (failed > 0 && lastError) {
    // Публичный ключ VAPID — всегда ровно 65 "сырых" байт (несжатая EC-точка), приватный — 32 байта.
    // В base64url это ~87-88 символов у публичного и ~43 у приватного. Если они перепутаны местами
    // (частая ошибка копипаста), длины будут не такими — это сразу видно без доступа к самим ключам.
    lastError += ` | Длина ключей на сервере: публичный=${VAPID_PUBLIC?.length ?? 0} симв. (должно быть ~87), приватный=${VAPID_PRIVATE?.length ?? 0} симв. (должно быть ~43)`;
  }
  return { total: docs.length, sent, failed, lastError };
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
