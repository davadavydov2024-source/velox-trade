import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { notifyAdminRegistration, notifyAdminTopUp, notifyAdminProductEdit, notifyAdminSellRequest } from "@/lib/telegramAdminNotify";

export const runtime = "nodejs";
export const maxDuration = 20;

/**
 * Клиент сообщает только «что случилось» (kind + id) — текст, фото и кнопки сервер собирает сам из
 * Firestore. Так нельзя прислать админу в Telegram произвольный текст/ссылку от чужого имени, а
 * проверка владельца записи не даёт спамить уведомлениями про чужие заявки.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const idToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    const decoded = await adminAuth().verifyIdToken(idToken).catch(() => null);
    if (!decoded) return NextResponse.json({ error: "Сессия истекла" }, { status: 401 });
    const uid = decoded.uid;

    const { kind, id } = (await req.json().catch(() => ({}))) as { kind?: string; id?: string };
    if (typeof kind !== "string" || typeof id !== "string" || !id) return NextResponse.json({ error: "Неверные данные" }, { status: 400 });

    const db = adminDb();
    const ownedBy = async (collection: string, field: string) => {
      const snap = await db.collection(collection).doc(id).get();
      return snap.exists && (snap.data() as Record<string, unknown>)[field] === uid;
    };

    if (kind === "registration") {
      if (id !== uid) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
      await notifyAdminRegistration(uid);
    } else if (kind === "topup") {
      if (!(await ownedBy("topups", "userId"))) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
      await notifyAdminTopUp(id);
    } else if (kind === "product_edit") {
      if (!(await ownedBy("productEditRequests", "sellerId"))) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
      await notifyAdminProductEdit(id);
    } else if (kind === "sell_request") {
      if (!(await ownedBy("sellRequests", "userId"))) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
      await notifyAdminSellRequest(id);
    } else {
      return NextResponse.json({ error: "Неизвестный тип" }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("notify/admin-event error:", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
