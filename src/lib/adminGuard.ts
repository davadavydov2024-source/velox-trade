import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "./firebaseAdmin";

function isAdminUid(uid: string): boolean {
  const list = (process.env.NEXT_PUBLIC_ADMIN_UIDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return list.includes(uid);
}

/** Проверяет, что запрос от админа. Возвращает uid админа или готовый ответ с ошибкой. */
export async function requireAdmin(req: NextRequest): Promise<{ uid: string } | { error: NextResponse }> {
  const authHeader = req.headers.get("authorization");
  const idToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!idToken) return { error: NextResponse.json({ error: "Не авторизован" }, { status: 401 }) };
  const decoded = await adminAuth().verifyIdToken(idToken).catch(() => null);
  if (!decoded) return { error: NextResponse.json({ error: "Сессия истекла" }, { status: 401 }) };
  if (!isAdminUid(decoded.uid)) return { error: NextResponse.json({ error: "Доступ только для администраторов" }, { status: 403 }) };
  return { uid: decoded.uid };
}

/** Журнал доступа админов к чувствительным данным (переписки, выгрузка пользователей). Сбой записи не ломает действие. */
export async function logAdminAccess(adminUid: string, action: string, details: Record<string, unknown> = {}) {
  try {
    await adminDb().collection("adminAuditLog").add({ adminUid, action, ...details, at: Date.now() });
  } catch (err) {
    console.error("logAdminAccess failed:", err);
  }
}
