import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { rollyGetPayment, rollyVerifyWebhookSignature, RollyPayError } from "@/lib/rollypay";
import { FieldValue } from "firebase-admin/firestore";

export const runtime = "nodejs";

/**
 * Колбэк RollyPay (адрес указан в личном кабинете кассы: /payments/callback).
 * ВАЖНО: обязательно проверяем подпись X-Signature / X-Timestamp секретом ROLLYPAY_SIGNING_SECRET —
 * без этого колбэк можно подделать. И даже после валидной подписи не начисляем баланс напрямую из
 * тела вебхука, а перепроверяем платёж отдельным авторизованным запросом к самому RollyPay —
 * так же, как это уже сделано для CactusPay.
 */
export async function POST(req: NextRequest) {
  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const signature = req.headers.get("x-signature");
  const timestamp = req.headers.get("x-timestamp");

  if (!rollyVerifyWebhookSignature(rawBody, timestamp, signature)) {
    console.error("payments/callback: неверная или отсутствующая подпись вебхука RollyPay");
    return NextResponse.json({ ok: false }, { status: 403 });
  }

  let event: { event_type?: string; payment_id?: string; order_id?: string; status?: string };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const orderId = event.order_id;
  if (typeof orderId !== "string" || !orderId) {
    console.error("payments/callback: нет order_id в теле вебхука");
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  try {
    const db = adminDb();
    const paymentRef = db.collection("payments").doc(orderId);
    const paymentSnap = await paymentRef.get();

    if (!paymentSnap.exists) {
      console.error(`payments/callback: платёж ${orderId} не найден в базе`);
      return NextResponse.json({ ok: false }, { status: 404 });
    }

    const payment = paymentSnap.data() as { userId: string; amount: number; status: string };

    // Идемпотентность: RollyPay может прислать колбэк повторно, если мы не ответили 2xx вовремя.
    if (payment.status === "paid") {
      return NextResponse.json({ ok: true, alreadyProcessed: true });
    }

    if (event.status === "canceled" || event.status === "expired" || event.event_type === "payment.canceled") {
      if (payment.status === "pending") {
        await paymentRef.update({ status: "cancelled", cancelledAt: Date.now(), cancelReason: "gateway" });
      }
      return NextResponse.json({ ok: true });
    }

    if (event.status !== "paid" || !event.payment_id) {
      // processing/created — просто подтверждаем получение, ждём финального статуса
      return NextResponse.json({ ok: true, status: event.status });
    }

    let verified;
    try {
      verified = await rollyGetPayment(event.payment_id);
    } catch (err) {
      console.error(`payments/callback: не удалось перепроверить платёж ${orderId} —`, err);
      return NextResponse.json({ ok: false }, { status: 502 });
    }

    if (verified.status !== "paid") {
      return NextResponse.json({ ok: true, status: verified.status });
    }

    await db.runTransaction(async (tx) => {
      const freshSnap = await tx.get(paymentRef);
      const fresh = freshSnap.data() as { status: string; userId: string; amount: number };
      if (fresh.status === "paid") return; // кто-то уже обработал параллельно

      tx.update(paymentRef, {
        status: "paid",
        paidAt: Date.now(),
        rollyPaymentId: verified.paymentId,
      });

      const userRef = db.collection("users").doc(fresh.userId);
      tx.update(userRef, { balance: FieldValue.increment(fresh.amount) });
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof RollyPayError) {
      console.error("RollyPay verify error:", err.message);
      return NextResponse.json({ ok: false, error: err.message }, { status: 502 });
    }
    console.error("payments/callback error:", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
