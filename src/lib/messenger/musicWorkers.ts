import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { adminAuth } from "@/lib/firebaseAdmin";
import { isAdminUid } from "@/lib/adminGuard";

/** Помощники по музыке: документ messengerMusicWorkers/{uid}. Назначает и снимает только админ. Помощник может лишь добавлять песни. */
export async function isMusicWorker(uid: string): Promise<boolean> {
  try { return (await adminDb().collection("messengerMusicWorkers").doc(uid).get()).exists; } catch { return false; }
}

/** Админ или помощник. role показывает, кто именно. */
export async function requireAdminOrWorker(req: NextRequest): Promise<{ uid: string; role: "admin" | "worker" } | { error: NextResponse }> {
  const h = req.headers.get("authorization");
  const idToken = h?.startsWith("Bearer ") ? h.slice(7) : null;
  if (!idToken) return { error: NextResponse.json({ error: "Не авторизован" }, { status: 401 }) };
  const decoded = await adminAuth().verifyIdToken(idToken).catch(() => null);
  if (!decoded) return { error: NextResponse.json({ error: "Сессия истекла" }, { status: 401 }) };
  if (isAdminUid(decoded.uid)) return { uid: decoded.uid, role: "admin" };
  if (await isMusicWorker(decoded.uid)) return { uid: decoded.uid, role: "worker" };
  return { error: NextResponse.json({ error: "Доступ только для администраторов и помощников" }, { status: 403 }) };
}
