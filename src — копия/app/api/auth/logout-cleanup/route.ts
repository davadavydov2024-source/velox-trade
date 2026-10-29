import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { PUSH_SUBS_COLLECTION, subscriptionDocId } from "@/lib/webPushServer";

export const runtime = "nodejs";

/**
 * Вызывается ПЕРЕД выходом из аккаунта на устройстве: удаляет запись этой сессии из списка
 * «Активные сессии» и отвязывает push-подписку этого устройства от аккаунта — иначе после выхода
 * устройство оставалось в списке сессий, а уведомления продолжали бы приходить на него.
 * Тело: { deviceId: string, endpoint?: string }.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const idToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    const decoded = await adminAuth().verifyIdToken(idToken).catch(() => null);
    if (!decoded) return NextResponse.json({ error: "Сессия истекла" }, { status: 401 });
    const uid = decoded.uid;

    const { deviceId, endpoint } = (await req.json().catch(() => ({}))) as { deviceId?: string; endpoint?: string };
    const db = adminDb();
    const batch = db.batch();

    if (typeof deviceId === "string" && deviceId && deviceId.length <= 100) {
      batch.delete(db.collection("sessions").doc(`${uid}_${deviceId}`));
      // Подписки, записанные с этим deviceId (если endpoint сменился или не определился на клиенте).
      const byDevice = await db.collection(PUSH_SUBS_COLLECTION).where("uid", "==", uid).where("deviceId", "==", deviceId).get();
      byDevice.docs.forEach((d) => batch.delete(d.ref));
    }

    if (typeof endpoint === "string" && endpoint) {
      const ref = db.collection(PUSH_SUBS_COLLECTION).doc(subscriptionDocId(endpoint));
      const snap = await ref.get();
      if (snap.exists && snap.data()?.uid === uid) batch.delete(ref);
    }

    await batch.commit();
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("logout-cleanup error:", err);
    return NextResponse.json({ error: "Не удалось выполнить очистку" }, { status: 500 });
  }
}
