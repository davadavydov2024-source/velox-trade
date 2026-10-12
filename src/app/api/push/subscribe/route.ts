import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

/**
 * Сохраняет FCM-токен устройства за текущим пользователем. Делается на сервере, а не addDoc'ом
 * с клиента, чтобы:
 *  1) не плодить дубли — раньше каждое включение уведомлений добавляло ещё один документ с тем же
 *     токеном, и одно событие приходило несколько раз;
 *  2) отвязать токен от прежнего аккаунта — если на этом браузере сначала сидел другой
 *     пользователь, его уведомления продолжали бы приходить на это устройство.
 * Тело: { token: string }.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const idToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    const decoded = await adminAuth().verifyIdToken(idToken).catch(() => null);
    if (!decoded) return NextResponse.json({ error: "Сессия истекла" }, { status: 401 });

    const { token } = (await req.json().catch(() => ({}))) as { token?: string };
    if (typeof token !== "string" || token.length < 20 || token.length > 1024) {
      return NextResponse.json({ error: "Неверный токен" }, { status: 400 });
    }

    const col = adminDb().collection("pushSubscriptions");
    const existing = await col.where("token", "==", token).get();

    let keep: FirebaseFirestore.QueryDocumentSnapshot | null = null;
    const batch = adminDb().batch();
    for (const d of existing.docs) {
      if (!keep && d.data().uid === decoded.uid) keep = d;
      else batch.delete(d.ref); // чужой аккаунт или дубль
    }
    if (keep) batch.update(keep.ref, { lastSeenAt: Date.now() });
    else batch.set(col.doc(), { uid: decoded.uid, token, createdAt: Date.now() });
    await batch.commit();

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("push/subscribe error:", err);
    return NextResponse.json({ error: "Не удалось сохранить подписку" }, { status: 500 });
  }
}
