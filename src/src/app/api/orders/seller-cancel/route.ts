import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { sendTelegramMessage } from "@/lib/telegramBot";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const idToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const decoded = await adminAuth().verifyIdToken(idToken).catch(() => null);
    if (!decoded) return NextResponse.json({ error: "Сессия истекла" }, { status: 401 });
    const uid = decoded.uid;

    const { orderId, reason } = await req.json();
    if (!orderId) return NextResponse.json({ error: "orderId обязателен" }, { status: 400 });

    const db = adminDb();
    const orderRef = db.collection("orders").doc(orderId);

    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) return NextResponse.json({ error: "Заказ не найден" }, { status: 404 });
    const order = orderSnap.data() as {
      sellerId: string;
      userId: string;
      total: number;
      status: string;
      items: { productId: string; quantity: number }[];
    };

    if (order.sellerId !== uid) return NextResponse.json({ error: "Это не твой заказ" }, { status: 403 });
    if (order.status !== "pending_confirmation") {
      return NextResponse.json({ error: "Отменить можно только заказ, который ещё не подтверждён покупателем" }, { status: 400 });
    }

    const buyerRef = db.collection("users").doc(order.userId);

    await db.runTransaction(async (tx) => {
      const freshOrderSnap = await tx.get(orderRef);
      if (freshOrderSnap.data()?.status !== "pending_confirmation") {
        throw new Error("already-resolved");
      }
      tx.update(orderRef, { status: "cancelled", cancelledAt: Date.now(), cancelReason: reason ?? null });
      tx.update(buyerRef, { balance: FieldValue.increment(order.total) });
      for (const item of order.items) {
        tx.update(db.collection("products").doc(item.productId), { stock: FieldValue.increment(item.quantity) });
      }

      const chatRef = db.collection("orderChats").doc(orderId);
      const chatSnap = await tx.get(chatRef);
      const message = {
        from: "system",
        text: `❌ Продавец отменил заказ. Деньги (${order.total} ₽) возвращены покупателю.${reason ? ` Причина: ${reason}` : ""}`,
        createdAt: Date.now(),
      };
      if (chatSnap.exists) {
        tx.update(chatRef, { messages: FieldValue.arrayUnion(message), updatedAt: Date.now() });
      } else {
        tx.set(chatRef, { orderId, buyerId: order.userId, sellerId: order.sellerId, messages: [message], updatedAt: Date.now() });
      }
    });

    const linkSnap = await db.collection("telegramLinks").doc(order.userId).get();
    if (linkSnap.exists) {
      const { chatId } = linkSnap.data() as { chatId: number };
      await sendTelegramMessage(chatId, `❌ Продавец отменил твой заказ на ${order.total} ₽ — деньги возвращены на баланс.`);
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    if (err?.message === "already-resolved") {
      return NextResponse.json({ error: "Заказ уже обработан" }, { status: 400 });
    }
    console.error("orders/seller-cancel error:", err);
    return NextResponse.json({ error: "Не удалось отменить заказ" }, { status: 500 });
  }
}
