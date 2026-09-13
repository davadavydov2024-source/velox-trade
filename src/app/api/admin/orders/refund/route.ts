import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { sendTelegramMessage } from "@/lib/telegramBot";
import { isAdminUid } from "@/lib/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Возврат заказа администратором — та же логика, что и в orders/seller-cancel, но доступна
 * админу (там жёстко проверяется order.sellerId === uid, обычному админу отдало бы 403). Нужна
 * для команды /refund в чате заказа (см. OrderChatThread) — например, когда спор решается в
 * пользу покупателя и деньги нужно вернуть, не заставляя продавца самого жать "отменить".
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const idToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const decoded = await adminAuth().verifyIdToken(idToken).catch(() => null);
    if (!decoded || !isAdminUid(decoded.uid)) return NextResponse.json({ error: "Доступ только для админов" }, { status: 403 });

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

    if (order.status !== "pending_confirmation" && order.status !== "disputed") {
      return NextResponse.json({ error: "Вернуть можно только неподтверждённый заказ или заказ в споре" }, { status: 400 });
    }

    const buyerRef = db.collection("users").doc(order.userId);

    await db.runTransaction(async (tx) => {
      const freshOrderSnap = await tx.get(orderRef);
      const freshStatus = freshOrderSnap.data()?.status;
      if (freshStatus !== "pending_confirmation" && freshStatus !== "disputed") throw new Error("already-resolved");

      tx.update(orderRef, { status: "cancelled", cancelledAt: Date.now(), cancelReason: reason ?? "Возврат администратором" });
      tx.update(buyerRef, { balance: FieldValue.increment(order.total) });
      for (const item of order.items) {
        tx.update(db.collection("products").doc(item.productId), { stock: FieldValue.increment(item.quantity) });
      }

      const chatRef = db.collection("orderChats").doc(orderId);
      const chatSnap = await tx.get(chatRef);
      const message = {
        from: "system",
        text: `↩️ Администратор вернул деньги покупателю (${order.total} ₽).${reason ? ` Причина: ${reason}` : ""}`,
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
      await sendTelegramMessage(chatId, `↩️ Администратор вернул тебе ${order.total} ₽ по заказу — деньги на балансе.`);
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    if (err?.message === "already-resolved") return NextResponse.json({ error: "Заказ уже обработан" }, { status: 400 });
    console.error("admin/orders/refund error:", err);
    return NextResponse.json({ error: "Не удалось вернуть деньги" }, { status: 500 });
  }
}
