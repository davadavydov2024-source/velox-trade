import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { cactusGetPayment, PENDING_PAYMENT_TIMEOUT_MS } from "@/lib/cactuspay";
import { FieldValue } from "firebase-admin/firestore";

export const runtime = "nodejs";

/**
 * Вызывается с клиента при открытии страницы пополнения. Если пользователь когда-то начал
 * оплату и просто ушёл, не заплатив (закрыл вкладку, передумал), запись "Ждём оплату" висела бы
 * вечно — эта ручка находит такие просроченные платежи ИМЕННО текущего пользователя и:
 * либо отменяет их (если CactusPay подтверждает, что оплаты не было),
 * либо, если оплата всё же прошла (просто вебхук ещё не долетел), сразу зачисляет баланс.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const idToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const auth = adminAuth();
    let uid: string;
    try {
      uid = (await auth.verifyIdToken(idToken)).uid;
    } catch {
      return NextResponse.json({ error: "Сессия истекла" }, { status: 401 });
    }

    const db = adminDb();
    const snap = await db.collection("payments").where("userId", "==", uid).where("status", "==", "pending").get();
    const now = Date.now();
    let cancelled = 0;
    let credited = 0;

    for (const docSnap of snap.docs) {
      const data = docSnap.data() as { createdAt: number };
      if (now - data.createdAt < PENDING_PAYMENT_TIMEOUT_MS) continue; // ещё не истёк срок ожидания

      try {
        const verified = await cactusGetPayment(docSnap.id);
        if (verified.status === "ACCEPT") {
          await db.runTransaction(async (tx) => {
            const freshSnap = await tx.get(docSnap.ref);
            const fresh = freshSnap.data() as { status: string; userId: string; amount: number };
            if (fresh.status === "paid") return;
            tx.update(docSnap.ref, { status: "paid", paidAt: Date.now(), cactusPaymentId: verified.id });
            tx.update(db.collection("users").doc(fresh.userId), { balance: FieldValue.increment(fresh.amount) });
          });
          credited++;
        } else {
          await docSnap.ref.update({ status: "cancelled", cancelledAt: Date.now(), cancelReason: "expired" });
          cancelled++;
        }
      } catch (err) {
        console.error(`payments/sweep-expired: не удалось проверить платёж ${docSnap.id} —`, err);
        // пропускаем — попробуем ещё раз при следующем визите на страницу
      }
    }

    return NextResponse.json({ ok: true, cancelled, credited });
  } catch (err) {
    console.error("payments/sweep-expired error:", err);
    return NextResponse.json({ error: "Не удалось проверить платежи" }, { status: 500 });
  }
}
