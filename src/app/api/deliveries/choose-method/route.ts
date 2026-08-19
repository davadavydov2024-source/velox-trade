import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { notifyTelegramServer } from "@/lib/telegramNotifyServer";
import { sendWebPush } from "@/lib/webPushServer";

export const runtime = "nodejs";

// Продавец выбирает способ выдачи заново для каждого заказа (не хранится в товаре):
// "seller" — отдаёт предмет сам, площадка в сделке не участвует (как раньше);
// "bot"    — выдача идёт через бота-посредника, дальше включается уже существующий
//            флоу DeliveryPanel (покупатель вписывает ник → сервер назначает бота → админ
//            вручную подтверждает получение ботом и выдачу покупателю).
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const idToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const decoded = await adminAuth().verifyIdToken(idToken).catch(() => null);
    if (!decoded) return NextResponse.json({ error: "Сессия истекла" }, { status: 401 });
    const uid = decoded.uid;

    const { orderId, method } = await req.json();
    if (typeof orderId !== "string" || !orderId) {
      return NextResponse.json({ error: "Не указан заказ" }, { status: 400 });
    }
    if (method !== "seller" && method !== "bot") {
      return NextResponse.json({ error: "Недопустимый способ выдачи" }, { status: 400 });
    }

    const db = adminDb();
    const deliveryRef = db.collection("deliveries").doc(orderId);

    const result = await db.runTransaction(async (tx) => {
      const deliverySnap = await tx.get(deliveryRef);
      if (!deliverySnap.exists) throw new Error("not-found");

      const delivery = deliverySnap.data() as { sellerId: string; buyerId: string; status: string; productName: string };
      if (delivery.sellerId !== uid) throw new Error("forbidden");
      if (delivery.status !== "awaiting_method") throw new Error("already-chosen");

      tx.update(deliveryRef, {
        method,
        methodChosenAt: Date.now(),
        // "seller" — заявка на бота больше не нужна, дальше действует обычная кнопка
        // "Подтвердить получение" у покупателя. "bot" — запускаем существующий флоу с ника.
        status: method === "bot" ? "awaiting_nickname" : "delivered",
      });

      const chatText =
        method === "bot"
          ? `🤖 Продавец выбрал выдачу через бота-посредника. Покупателю нужно указать свой игровой ник.`
          : `🤝 Продавец выбрал выдать предмет самостоятельно, без бота-посредника.`;

      // Документ orderChats к этому моменту может ещё не существовать (первого сообщения могло
      // не быть) — set + merge, а не update, чтобы не уронить транзакцию на несуществующем доке.
      tx.set(
        db.collection("orderChats").doc(orderId),
        {
          orderId,
          buyerId: delivery.buyerId,
          sellerId: delivery.sellerId,
          messages: FieldValue.arrayUnion({ from: "system", text: chatText, createdAt: Date.now() }),
          updatedAt: Date.now(),
        },
        { merge: true }
      );

      return { buyerId: delivery.buyerId, productName: delivery.productName, method };
    });

    if (result.method === "bot") {
      notifyTelegramServer(result.buyerId, `🤖 Продавец выбрал выдачу через бота-посредника — укажи свой игровой ник в заказе.`);
      sendWebPush(result.buyerId, { title: "Нужно указать игровой ник", body: result.productName, url: "/chats" }, "purchases");
    }

    return NextResponse.json({ ok: true, method: result.method });
  } catch (err: any) {
    if (err?.message === "not-found") return NextResponse.json({ error: "Заявка на выдачу не найдена" }, { status: 404 });
    if (err?.message === "forbidden") return NextResponse.json({ error: "Это не твой заказ" }, { status: 403 });
    if (err?.message === "already-chosen") return NextResponse.json({ error: "Способ выдачи уже выбран" }, { status: 400 });
    console.error("deliveries/choose-method error:", err);
    return NextResponse.json({ error: "Не удалось сохранить способ выдачи" }, { status: 500 });
  }
}
