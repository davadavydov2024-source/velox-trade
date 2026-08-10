import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { cactusGetPayment, CactusPayError } from "@/lib/cactuspay";
import { FieldValue } from "firebase-admin/firestore";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const idToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const auth = adminAuth();
    let uid: string;
    try {
      uid = (await auth.verifyIdToken(idToken)).uid;
    } catch {
      return NextResponse.json({ error: "Сессия истекла. Войди заново." }, { status: 401 });
    }

    const { orderId } = await req.json();
    if (typeof orderId !== "string" || !orderId) {
      return NextResponse.json({ error: "Не указан платёж" }, { status: 400 });
    }

    const db = adminDb();
    const paymentRef = db.collection("payments").doc(orderId);
    const snap = await paymentRef.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Платёж не найден" }, { status: 404 });
    }

    const payment = snap.data() as { userId: string; status: string; amount: number };
    if (payment.userId !== uid) {
      return NextResponse.json({ error: "Это не твой платёж" }, { status: 403 });
    }
    if (payment.status !== "pending") {
      return NextResponse.json({ error: "Этот платёж уже нельзя отменить" }, { status: 400 });
    }

    // ВАЖНО: как и в вебхуке, не доверяем нашей же локальной пометке "pending" — перепроверяем
    // реальный статус у самого CactusPay. Если оплата уже прошла (просто вебхук ещё не дошёл),
    // отменять нельзя — вместо этого сразу зачисляем баланс, как это сделал бы вебхук.
    try {
      const verified = await cactusGetPayment(orderId);
      if (verified.status === "ACCEPT") {
        await db.runTransaction(async (tx) => {
          const freshSnap = await tx.get(paymentRef);
          const fresh = freshSnap.data() as { status: string; userId: string; amount: number };
          if (fresh.status === "paid") return;
          tx.update(paymentRef, { status: "paid", paidAt: Date.now(), cactusPaymentId: verified.id });
          tx.update(db.collection("users").doc(fresh.userId), { balance: FieldValue.increment(fresh.amount) });
        });
        return NextResponse.json({ error: "Оплата уже поступила — баланс зачислен, отмена не нужна" }, { status: 409 });
      }
    } catch (err) {
      console.error(`payments/cancel: не удалось перепроверить платёж ${orderId} —`, err);
      return NextResponse.json({ error: "Не удалось проверить статус платежа. Попробуй ещё раз через минуту." }, { status: 502 });
    }

    await paymentRef.update({ status: "cancelled", cancelledAt: Date.now() });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof CactusPayError) {
      console.error("CactusPay verify error:", err.message);
      return NextResponse.json({ error: err.message }, { status: 502 });
    }
    console.error("payments/cancel error:", err);
    return NextResponse.json({ error: "Не удалось отменить платёж" }, { status: 500 });
  }
}
