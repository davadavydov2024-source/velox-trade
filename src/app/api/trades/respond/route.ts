import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { notifyTelegramServer } from "@/lib/telegramNotifyServer";
import { sendWebPush } from "@/lib/webPushServer";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const idToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const decoded = await adminAuth().verifyIdToken(idToken).catch(() => null);
    if (!decoded) return NextResponse.json({ error: "Сессия истекла" }, { status: 401 });
    const uid = decoded.uid;

    const { tradeId, action } = await req.json();
    if (typeof tradeId !== "string" || !tradeId) return NextResponse.json({ error: "Не указана заявка" }, { status: 400 });
    if (action !== "accept" && action !== "reject" && action !== "cancel") {
      return NextResponse.json({ error: "Недопустимое действие" }, { status: 400 });
    }

    const db = adminDb();
    const tradeRef = db.collection("tradeOffers").doc(tradeId);

    if (action === "reject" || action === "cancel") {
      const snap = await tradeRef.get();
      if (!snap.exists) return NextResponse.json({ error: "Заявка не найдена" }, { status: 404 });
      const trade = snap.data() as { status: string; toUserId: string; fromUserId: string; toUserNick: string; offeredProductName: string; requestedProductName: string };
      if (trade.status !== "pending") return NextResponse.json({ error: "Заявка уже обработана" }, { status: 400 });
      const allowedUid = action === "reject" ? trade.toUserId : trade.fromUserId;
      if (uid !== allowedUid) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
      await tradeRef.update({ status: action === "reject" ? "rejected" : "cancelled", respondedAt: Date.now() });

      if (action === "reject") {
        notifyTelegramServer(trade.fromUserId, `❌ ${trade.toUserNick} отклонил(а) твоё предложение обмена: «${trade.offeredProductName}» на «${trade.requestedProductName}».`);
        sendWebPush(trade.fromUserId, { title: "Обмен отклонён", body: `${trade.toUserNick} отклонил(а) предложение`, url: "/profile/trades" }, "purchases");
      }

      return NextResponse.json({ ok: true });
    }

    // action === "accept"
    const result = await db.runTransaction(async (tx) => {
      const snap = await tx.get(tradeRef);
      if (!snap.exists) throw new Error("not-found");
      const trade = snap.data() as {
        status: string;
        toUserId: string;
        fromUserId: string;
        fromUserNick: string;
        toUserNick: string;
        offeredProductId: string;
        offeredProductName: string;
        offeredGameId: string;
        requestedProductId: string;
        requestedProductName: string;
        requestedGameId: string;
        extraBalanceFromProposer?: number;
      };
      if (trade.status !== "pending") throw new Error("already-resolved");
      if (uid !== trade.toUserId) throw new Error("forbidden");

      const offeredRef = db.collection("products").doc(trade.offeredProductId);
      const requestedRef = db.collection("products").doc(trade.requestedProductId);
      const [offeredSnap, requestedSnap, fromUserSnap] = await Promise.all([
        tx.get(offeredRef),
        tx.get(requestedRef),
        tx.get(db.collection("users").doc(trade.fromUserId)),
      ]);

      if (!offeredSnap.exists || !requestedSnap.exists) throw new Error("product-gone");
      const offeredStock = (offeredSnap.data()?.stock ?? 0) as number;
      const requestedStock = (requestedSnap.data()?.stock ?? 0) as number;
      if (offeredStock < 1 || requestedStock < 1) throw new Error("out-of-stock");

      const extra = trade.extraBalanceFromProposer ?? 0;
      if (extra > 0) {
        const fromBalance = (fromUserSnap.data()?.balance ?? 0) as number;
        if (fromBalance < extra) throw new Error("insufficient-balance");
      }

      tx.update(offeredRef, { stock: FieldValue.increment(-1) });
      tx.update(requestedRef, { stock: FieldValue.increment(-1) });
      if (extra > 0) {
        tx.update(db.collection("users").doc(trade.fromUserId), { balance: FieldValue.increment(-extra) });
        tx.update(db.collection("users").doc(trade.toUserId), { balance: FieldValue.increment(extra) });
      }

      tx.update(tradeRef, { status: "accepted", respondedAt: Date.now() });

      // Leg A: fromUser получает запрошенный товар, toUser его отдаёт. Прямой обмен всегда идёт
      // через бота — тут нет обычного "продавца", который мог бы заранее выбрать способ выдачи.
      const legARef = db.collection("deliveries").doc(`${tradeId}_a`);
      tx.set(legARef, {
        orderId: legARef.id,
        source: "trade",
        tradeId,
        buyerId: trade.fromUserId,
        sellerId: trade.toUserId,
        productId: trade.requestedProductId,
        productName: trade.requestedProductName,
        gameId: trade.requestedGameId,
        method: "bot",
        status: "awaiting_nickname",
        createdAt: Date.now(),
      });

      // Leg B: toUser получает предложенный товар, fromUser его отдаёт.
      const legBRef = db.collection("deliveries").doc(`${tradeId}_b`);
      tx.set(legBRef, {
        orderId: legBRef.id,
        source: "trade",
        tradeId,
        buyerId: trade.toUserId,
        sellerId: trade.fromUserId,
        productId: trade.offeredProductId,
        productName: trade.offeredProductName,
        gameId: trade.offeredGameId,
        method: "bot",
        status: "awaiting_nickname",
        createdAt: Date.now(),
      });

      tx.set(db.collection("tradeChats").doc(tradeId), {
        tradeId,
        fromUserId: trade.fromUserId,
        toUserId: trade.toUserId,
        messages: [
          {
            from: "system",
            text: `🔄 Обмен подтверждён: ${trade.fromUserNick} отдаёт «${trade.offeredProductName}», ${trade.toUserNick} отдаёт «${trade.requestedProductName}»${
              extra > 0 ? ` + доплата ${extra} ₽ от ${trade.fromUserNick}` : ""
            }. Оба предмета передаются через ботов-посредников — см. карточки выдачи ниже.`,
            createdAt: Date.now(),
          },
        ],
        updatedAt: Date.now(),
      });

      return { fromUserId: trade.fromUserId, toUserId: trade.toUserId, offeredProductName: trade.offeredProductName, requestedProductName: trade.requestedProductName };
    });

    notifyTelegramServer(result.fromUserId, `✅ Твоё предложение обмена принято! «${result.offeredProductName}» ⇄ «${result.requestedProductName}». Заходи в чат обмена, чтобы начать передачу.`);
    sendWebPush(result.fromUserId, { title: "Обмен принят!", body: `${result.offeredProductName} ⇄ ${result.requestedProductName}`, url: `/profile/trades/${tradeId}` }, "purchases");

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    if (err?.message === "not-found") return NextResponse.json({ error: "Заявка не найдена" }, { status: 404 });
    if (err?.message === "already-resolved") return NextResponse.json({ error: "Заявка уже обработана" }, { status: 400 });
    if (err?.message === "forbidden") return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    if (err?.message === "product-gone") return NextResponse.json({ error: "Один из товаров больше не существует" }, { status: 400 });
    if (err?.message === "out-of-stock") return NextResponse.json({ error: "Один из товаров закончился" }, { status: 400 });
    if (err?.message === "insufficient-balance") return NextResponse.json({ error: "У предложившего обмен не хватает баланса на доплату" }, { status: 400 });
    console.error("trades/respond error:", err);
    return NextResponse.json({ error: "Не удалось обработать заявку" }, { status: 500 });
  }
}
