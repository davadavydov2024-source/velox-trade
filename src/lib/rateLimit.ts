import { createHash } from "crypto";
import { NextRequest } from "next/server";
import { adminDb } from "./firebaseAdmin";

/**
 * Простой лимитер на Firestore (серверный): не больше `limit` действий за окно `windowMs` по ключу.
 * Возвращает false, если лимит исчерпан. При сбое самой проверки пропускает действие (лучше
 * пропустить одно лишнее, чем положить сайт), но пишет ошибку в лог. Документы живут в коллекции
 * rateLimits — при желании включи TTL по полю expireAt в Firebase Console, чтобы они чистились сами.
 */
export async function rateLimit(key: string, limit: number, windowMs: number): Promise<boolean> {
  try {
    const id = createHash("sha256").update(key).digest("hex").slice(0, 40);
    const ref = adminDb().collection("rateLimits").doc(id);
    return await adminDb().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const now = Date.now();
      const d = snap.data() as { count: number; windowStart: number } | undefined;
      if (!d || now - d.windowStart >= windowMs) {
        tx.set(ref, { count: 1, windowStart: now, expireAt: new Date(now + windowMs * 2) });
        return true;
      }
      if (d.count >= limit) return false;
      tx.update(ref, { count: d.count + 1 });
      return true;
    });
  } catch (err) {
    console.error("rateLimit error:", err);
    return true;
  }
}

/** IP клиента за прокси Vercel. */
export function clientIp(req: NextRequest): string {
  return (req.headers.get("x-forwarded-for")?.split(",")[0] ?? req.headers.get("x-real-ip") ?? "unknown").trim();
}
