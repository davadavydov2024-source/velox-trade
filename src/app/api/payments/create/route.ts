import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { rollyCreatePayment, RollyPayError } from "@/lib/rollypay";

export const runtime = "nodejs";

const MIN_AMOUNT = 100;

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

    const db = adminDb();
    const userSnap = await db.collection("users").doc(uid).get();
    if (!userSnap.exists) {
      return NextResponse.json({ error: "Профиль не найден" }, { status: 404 });
    }
    const userData = userSnap.data() as { displayName: string; banned?: boolean };
    if (userData.banned) {
      return NextResponse.json({ error: "Аккаунт заблокирован" }, { status: 403 });
    }

    const { amount } = await req.json();
    const num = Number(amount);
    if (!num || num < MIN_AMOUNT) {
      return NextResponse.json({ error: `Минимальная сумма пополнения — ${MIN_AMOUNT} ₽` }, { status: 400 });
    }

    // Простая защита от спама запросами: не чаще одного нового платежа в 10 секунд на пользователя.
    // Без orderBy: where + orderBy на разных полях потребовал бы составного индекса в Firestore.
    const recentSnap = await db.collection("payments").where("userId", "==", uid).get();
    if (!recentSnap.empty) {
      const lastCreatedAt = Math.max(...recentSnap.docs.map((d) => (d.data() as { createdAt: number }).createdAt));
      if (Date.now() - lastCreatedAt < 10_000) {
        return NextResponse.json({ error: "Подожди немного перед созданием новой заявки на оплату" }, { status: 429 });
      }
    }

    const orderId = `vt_${uid.slice(0, 8)}_${Date.now()}`;
    const origin = req.headers.get("origin") || req.nextUrl.origin;
    const redirectUrl = `${origin}/profile/topup?order_id=${orderId}`;
    const description = `Пополнение баланса Velox Trade — ${userData.displayName}`;

    const { payUrl, paymentId } = await rollyCreatePayment({ amount: num, orderId, description, redirectUrl });

    await db.collection("payments").doc(orderId).set({
      userId: uid,
      userNick: userData.displayName,
      amount: num,
      status: "pending",
      paymentUrl: payUrl,
      rollyPaymentId: paymentId,
      createdAt: Date.now(),
    });

    return NextResponse.json({ url: payUrl, orderId });
  } catch (err) {
    if (err instanceof RollyPayError) {
      console.error("RollyPay create error:", err.message);
      return NextResponse.json({ error: err.message }, { status: 502 });
    }
    console.error("payments/create error:", err);
    return NextResponse.json({ error: "Не удалось создать платёж. Попробуй позже." }, { status: 500 });
  }
}
