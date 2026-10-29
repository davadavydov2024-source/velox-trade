import { NextRequest } from "next/server";
import { adminAuth } from "@/lib/firebaseAdmin";

/** Возвращает uid, если в запросе валидный Firebase ID token (`Authorization: Bearer ...`), иначе null.
 * Сессий на cookie нет, поэтому классический CSRF здесь неприменим: браузер сам заголовок не подставит. */
export async function requireUser(req: NextRequest): Promise<string | null> {
  const h = req.headers.get("authorization");
  const token = h?.startsWith("Bearer ") ? h.slice(7) : null;
  if (!token) return null;
  const decoded = await adminAuth().verifyIdToken(token).catch(() => null);
  return decoded?.uid ?? null;
}
