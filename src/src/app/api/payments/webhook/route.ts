import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { cactusGetPayment, CactusPayError } from "@/lib/cactuspay";
import { FieldValue } from "firebase-admin/firestore";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    // CactusPay шлёт application/x-www-form-urlencoded
    const formData = await req.formData();
    const orderId = formData.get("order_id");

    if (typeof orderId !== "string" || !orderId) {
      console.error("payments/webhook: нет order_id в теле запроса");
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    const db = adminDb();
    const paymentRef = db.collection("payments").doc(orderId);
    const paymentSnap = await paymentRef.get();

    if (!paymentSnap.exists) {
      console.error(`payments/webhook: платёж ${orderId} не найден в базе`);
      return NextResponse.json({ ok: false }, { status: 404 });
    }

    const payment = paymentSnap.data() as { userId: string; amount: number; status: string };

    // Идемпотентность: если уже обработан — не начисляем повторно (CactusPay может слать вебхук не один раз).
    if (payment.status === "paid") {
      return NextResponse.json({ ok: true, alreadyProcessed: true });
    }

    // ВАЖНО: не доверяем входящему вебхуку напрямую (в нём нет подписи/HMAC) — согласно их же
    // документации, перепроверяем статус отдельным авторизованным запросом с нашим секретным токеном.
    let verified;
    try {
      verified = await cactusGetPayment(orderId);
    } catch (err) {
      console.error(`payments/webhook: не удалось перепроверить платёж ${orderId} —`, err);
      return NextResponse.json({ ok: false }, { status: 502 });
    }

    if (verified.status !== "ACCEPT") {
      // Платёж ещё не подтверждён самим CactusPay — ничего не начисляем, ждём следующего вебхука.
      return NextResponse.json({ ok: true, status: verified.status });
    }

    // Транзакция: сначала читаем актуальное состояние платежа (защита от повторной обработки при
    // параллельных запросах), и только если он ещё не обработан — атомарно помечаем оплаченным
    // и начисляем баланс через increment (не требует отдельного чтения текущего значения).
    await db.runTransaction(async (tx) => {
      const freshSnap = await tx.get(paymentRef);
      const fresh = freshSnap.data() as { status: string; userId: string; amount: number };
      if (fresh.status === "paid") return; // кто-то уже обработал параллельно

      tx.update(paymentRef, {
        status: "paid",
        paidAt: Date.now(),
        cactusPaymentId: verified.id,
      });

      const userRef = db.collection("users").doc(fresh.userId);
      tx.update(userRef, { balance: FieldValue.increment(fresh.amount) });
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof CactusPayError) {
      console.error("CactusPay verify error:", err.message);
      return NextResponse.json({ ok: false, error: err.message }, { status: 502 });
    }
    console.error("payments/webhook error:", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
