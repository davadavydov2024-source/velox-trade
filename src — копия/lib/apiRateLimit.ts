import { NextRequest } from "next/server";
import { adminDb } from "./firebaseAdmin";
import { getClientIp } from "./getClientIp";

/**
 * Ограничитель частоты на Firestore (работает и на serverless, где память инстансов не общая).
 * Возвращает true, если запрос можно выполнять, false — если лимит за окно исчерпан.
 * При сбое хранилища возвращает false (лучше отказать, чем пропустить перебор кодов).
 * Коллекция rateLimits закрыта правилами Firestore (доступ только у Admin SDK).
 */
export async function rateLimit(key: string, limit: number, windowMs: number): Promise<boolean> {
  const db = adminDb();
  const ref = db.collection("rateLimits").doc(key.replace(/[\/\s]/g, "_").slice(0, 300));
  try {
    return await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const now = Date.now();
      const d = snap.data() as { count: number; windowStart: number } | undefined;
      if (!d || now - d.windowStart > windowMs) {
        tx.set(ref, { count: 1, windowStart: now });
        return true;
      }
      if (d.count >= limit) return false;
      tx.update(ref, { count: d.count + 1 });
      return true;
    });
  } catch (err) {
    console.error("rateLimit error:", err);
    return false;
  }
}

export function ipKey(req: NextRequest | Request, name: string): string {
  return `${name}_ip_${getClientIp(req)}`;
}
