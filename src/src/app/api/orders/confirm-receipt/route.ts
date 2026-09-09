import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { notifyTelegramServer } from "@/lib/telegramNotifyServer";
import { sendWebPush } from "@/lib/webPushServer";

export const runtime = "nodejs";

const HOLD_DURATION_MS = 48 * 60 * 60 * 1000;

/**
 * Покупатель подтверждает получение товара. Раньше это был чисто клиентский updateDoc (см.
 * lib/users.ts → confirmOrderReceipt, теперь обёртка над этим роутом) — деньги продавцу нигде не
 * зачислялись вообще, это было незакрытой дырой. Теперь тут же создаётся PendingPayout со
 * статусом "holding": деньги висят в холде 48 часов (защита от спора уже после того как продавец
 * получил бы деньги) и зачисляются на баланс автоматически через api/cron/release-payouts.
 * Системное сообщение в чат заказа и достижения продолжает отправлять клиент (OrderChatThread) —
 * этот роут отвечает только за деньги.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const idToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const decoded = await adminAuth().verifyIdToken(idToken).catch(() => null);
    if (!decoded) return NextResponse.json({ error: "Сессия истекла" }, { status: 401 });
    const uid = decoded.uid;

    const { orderId } = await req.json();
    if (typeof orderId !== "string" || !orderId) return NextResponse.json({ error: "Не указан заказ" }, { status: 400 });

    const db = adminDb();
    const orderRef = db.collection("orders").doc(orderId);

    const result = await db.runTransaction(async (tx) => {
      const orderSnap = await tx.get(orderRef);
      if (!orderSnap.exists) throw new Error("not-found");
      const order = orderSnap.data()!;
      if (order.userId !== uid) throw new Error("forbidden");
      if (order.status !== "pending_confirmation") throw new Error("already-resolved");

      const now = Date.now();
      tx.update(orderRef, { status: "confirmed", confirmedAt: now });

      const payoutRef = db.collection("pendingPayouts").doc(orderId);
      tx.set(payoutRef, {
        id: orderId,
        orderId,
        sellerId: order.sellerId,
        amount: order.total,
        status: "holding",
        createdAt: now,
        releaseAt: now + HOLD_DURATION_MS,
      });

      return { sellerId: order.sellerId as string, total: order.total as number };
    });

    notifyTelegramServer(result.sellerId, `✅ Покупатель подтвердил получение заказа на ${result.total} ₽. Деньги поступят на баланс через 48 часов.`);
    sendWebPush(result.sellerId, { title: "Получение подтверждено", body: `${result.total} ₽ — деньги придут через 48ч`, url: "/profile/orders" }, "purchases");

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    const messages: Record<string, string> = {
      "not-found": "Заказ не найден",
      forbidden: "Это не ваш заказ",
      "already-resolved": "Заказ уже обработан",
    };
    if (err?.message && messages[err.message]) {
      return NextResponse.json({ error: messages[err.message] }, { status: 400 });
    }
    console.error("orders/confirm-receipt error:", err);
    return NextResponse.json({ error: "Не удалось подтвердить получение" }, { status: 500 });
  }
}
