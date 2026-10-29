import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { PUSH_SUBS_COLLECTION, subscriptionDocId } from "@/lib/webPushServer";

export const runtime = "nodejs";

/** Удаляет подписку устройства текущего пользователя. Тело: { endpoint } или { id } (id документа из отчёта теста). */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const idToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    const decoded = await adminAuth().verifyIdToken(idToken).catch(() => null);
    if (!decoded) return NextResponse.json({ error: "Сессия истекла" }, { status: 401 });

    const { endpoint, id } = (await req.json().catch(() => ({}))) as { endpoint?: string; id?: string };
    const docId = typeof id === "string" && /^[a-f0-9]{64}$/.test(id) ? id : typeof endpoint === "string" && endpoint ? subscriptionDocId(endpoint) : null;
    if (!docId) return NextResponse.json({ error: "Не указано устройство" }, { status: 400 });

    const ref = adminDb().collection(PUSH_SUBS_COLLECTION).doc(docId);
    const snap = await ref.get();
    if (snap.exists && snap.data()?.uid === decoded.uid) await ref.delete();
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("push/unsubscribe error:", err);
    return NextResponse.json({ error: "Не удалось отписаться" }, { status: 500 });
  }
}
