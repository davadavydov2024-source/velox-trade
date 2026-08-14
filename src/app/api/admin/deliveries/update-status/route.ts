import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

function isAdminUid(uid: string): boolean {
  const list = (process.env.NEXT_PUBLIC_ADMIN_UIDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return list.includes(uid);
}

const NEXT_STATUS: Record<string, string> = {
  awaiting_transfer: "received_by_bot", // админ вручную проверил в игре: бот получил предмет от продавца
  received_by_bot: "delivered", // админ вручную выдал предмет покупателю у бота
};

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const idToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const decoded = await adminAuth().verifyIdToken(idToken).catch(() => null);
    if (!decoded || !isAdminUid(decoded.uid)) {
      return NextResponse.json({ error: "Доступ только для администраторов" }, { status: 403 });
    }

    const { orderId, status } = await req.json();
    if (typeof orderId !== "string" || !orderId) {
      return NextResponse.json({ error: "Не указан заказ" }, { status: 400 });
    }
    if (status !== "received_by_bot" && status !== "delivered") {
      return NextResponse.json({ error: "Недопустимый статус" }, { status: 400 });
    }

    const db = adminDb();
    const deliveryRef = db.collection("deliveries").doc(orderId);

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(deliveryRef);
      if (!snap.exists) throw new Error("not-found");
      const delivery = snap.data() as { status: string; expiresAt: number };

      // Разрешаем идти только по цепочке awaiting_transfer → received_by_bot → delivered —
      // нельзя перепрыгнуть шаг (например, отметить "выдано", ещё не подтвердив получение ботом).
      if (NEXT_STATUS[delivery.status] !== status) {
        throw new Error(`wrong-order:${delivery.status}`);
      }

      const timestampField = status === "received_by_bot" ? "receivedAt" : "deliveredAt";
      const adminField = status === "received_by_bot" ? "receivedByAdminUid" : "deliveredByAdminUid";
      tx.update(deliveryRef, { status, [timestampField]: Date.now(), [adminField]: decoded.uid });
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    if (err?.message === "not-found") return NextResponse.json({ error: "Заявка не найдена" }, { status: 404 });
    if (typeof err?.message === "string" && err.message.startsWith("wrong-order:")) {
      return NextResponse.json({ error: `Нельзя изменить статус из текущего состояния «${err.message.split(":")[1]}»` }, { status: 400 });
    }
    console.error("admin/deliveries/update-status error:", err);
    return NextResponse.json({ error: "Не удалось обновить статус" }, { status: 500 });
  }
}
