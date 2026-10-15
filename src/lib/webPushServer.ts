import { createHash } from "crypto";
import { adminDb } from "./firebaseAdmin";
import { PushCategories, DEFAULT_PUSH_CATEGORIES } from "@/types";
import { getVapidConfig, sendRawWebPush, VapidConfig } from "./webpushProtocol";

export type PushCategory = keyof PushCategories;

/** Коллекция подписок стандартного Web Push (не Firebase): { uid, endpoint, p256dh, auth, createdAt }. */
export const PUSH_SUBS_COLLECTION = "webPushSubs";

export function subscriptionDocId(endpoint: string): string {
  return createHash("sha256").update(endpoint).digest("hex");
}

interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

interface StoredSub {
  uid?: string;
  endpoint?: string;
  p256dh?: string;
  auth?: string;
}

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://velox-trade-zeta.vercel.app").replace(/\/+$/, "");

/**
 * Ссылка в уведомлении — только на наш сайт: относительный путь ("/chats") превращается в полный
 * адрес, чужие домены отбрасываются (в push нельзя вставить ссылку на посторонний сайт).
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
    // не URL — ссылку игнорируем, само уведомление всё равно отправится
  }
  return undefined;
}

/** Тело, которое получит service worker (public/push-sw.js) в событии "push". */
function buildPayload(payload: PushPayload) {
  const link = toAbsoluteLink(payload.url);
  return {
    title: payload.title.slice(0, 120),
    body: payload.body.slice(0, 300),
    icon: `${SITE_URL}/icons/icon-192.png`,
    ...(link ? { url: link } : {}),
  };
}

export interface PushSendReport {
  devices: number;
  sent: number;
  failed: number;
  errors: string[];
}

function describeFailure(status: number, error?: string): string {
  if (status === 401 || status === 403) {
    return `${error ?? status}: push-сервис не принял VAPID-ключи. Проверь, что NEXT_PUBLIC_VAPID_PUBLIC_KEY и VAPID_PRIVATE_KEY — одна пара, и что пользователь заново включил уведомления после смены ключей`;
  }
  if (status === 404 || status === 410) return `${status}: подписка устарела (уведомления отключены или данные сайта очищены) — удалена`;
  return error ?? `ошибка ${status}`;
}

async function sendToDoc(
  doc: FirebaseFirestore.QueryDocumentSnapshot,
  payload: PushPayload,
  cfg: VapidConfig
): Promise<{ ok: boolean; error?: string }> {
  const sub = doc.data() as StoredSub;
  if (!sub.endpoint || !sub.p256dh || !sub.auth) {
    await doc.ref.delete().catch(() => {});
    return { ok: false, error: "битая подписка удалена" };
  }
  const res = await sendRawWebPush({ endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth }, buildPayload(payload), cfg);
  if (res.ok) return { ok: true };
  if (res.gone) await doc.ref.delete().catch(() => {});
  return { ok: false, error: describeFailure(res.status, res.error) };
}

/** Как sendWebPush, но без проверки категорий и с подробным отчётом — для кнопки «Тест» в профиле. */
export async function sendWebPushDetailed(uid: string, payload: PushPayload): Promise<PushSendReport> {
  const cfg = getVapidConfig();
  if (!cfg) throw new Error("VAPID-ключи не заданы на сервере (NEXT_PUBLIC_VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY)");
  const snap = await adminDb().collection(PUSH_SUBS_COLLECTION).where("uid", "==", uid).get();
  const report: PushSendReport = { devices: snap.size, sent: 0, failed: 0, errors: [] };
  await Promise.all(
    snap.docs.map(async (doc) => {
      const r = await sendToDoc(doc, payload, cfg);
      if (r.ok) report.sent++;
      else {
        report.failed++;
        if (r.error) report.errors.push(r.error);
      }
    })
  );
  return report;
}

/**
 * Рассылка ВСЕМ подписанным пользователям — для админских рассылок (/admin/notifications).
 * Считается категорией "news": уважает отключённую пользователем категорию «Новости и объявления».
 */
export async function sendWebPushBroadcast(payload: PushPayload): Promise<{ total: number; sent: number; failed: number; lastError?: string }> {
  const cfg = getVapidConfig();
  if (!cfg) return { total: 0, sent: 0, failed: 0, lastError: "VAPID-ключи не заданы на сервере" };
  const snap = await adminDb().collection(PUSH_SUBS_COLLECTION).get();
  if (snap.empty) return { total: 0, sent: 0, failed: 0 };

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  let lastError: string | undefined;
  const BATCH = 50;
  const docs = snap.docs;
  for (let i = 0; i < docs.length; i += BATCH) {
    await Promise.all(
      docs.slice(i, i + BATCH).map(async (doc) => {
        const uid = (doc.data() as StoredSub).uid;
        if (uid && !(await isCategoryEnabled(uid, "news"))) {
          skipped++;
          return;
        }
        const r = await sendToDoc(doc, payload, cfg);
        if (r.ok) sent++;
        else {
          failed++;
          lastError = r.error;
          console.error("sendWebPushBroadcast error:", r.error);
        }
      })
    );
  }
  return { total: docs.length - skipped, sent, failed, lastError };
}

/**
 * Шлёт push во все устройства пользователя. Устаревшие подписки удаляются. Уважает настройки
 * категорий уведомлений (/profile/security): если категория выключена — просто не отправляет.
 */
export async function sendWebPush(uid: string, payload: PushPayload, category: PushCategory = "messages"): Promise<void> {
  try {
    const cfg = getVapidConfig();
    if (!cfg) return;
    if (!(await isCategoryEnabled(uid, category))) return;

    const snap = await adminDb().collection(PUSH_SUBS_COLLECTION).where("uid", "==", uid).get();
    if (snap.empty) return;
    await Promise.all(
      snap.docs.map(async (doc) => {
        const r = await sendToDoc(doc, payload, cfg);
        if (!r.ok) console.error("sendWebPush error:", r.error);
      })
    );
  } catch (err) {
    console.error("sendWebPush outer error:", err);
  }
}

/** Включена ли у пользователя данная категория (по умолчанию — да, у старых профилей поля нет). */
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
