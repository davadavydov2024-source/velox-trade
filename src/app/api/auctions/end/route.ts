import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { notifyTelegramServer } from "@/lib/telegramNotifyServer";
import { sendWebPush } from "@/lib/webPushServer";
import { maskNickname } from "@/lib/maskNickname";

export const runtime = "nodejs";

// Продавец завершает аукцион вручную (фиксированной даты окончания нет). Деньги победителя уже
// списаны и лежат held на его ставке (см. api/auctions/bid) — тут остаётся только оформить
// Order/Delivery по той же схеме, что и обычная покупка (checkout/route.ts), и пометить ставку
// won. Если ставок не было вовсе — просто закрываем аукцион без заказа.
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const idToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const decoded = await adminAuth().verifyIdToken(idToken).catch(() => null);
    if (!decoded) return NextResponse.json({ error: "Сессия истекла" }, { status: 401 });
    const uid = decoded.uid;

    const { productId } = await req.json();
    if (typeof productId !== "string" || !productId) return NextResponse.json({ error: "Не указан товар" }, { status: 400 });

    const db = adminDb();
    const productRef = db.collection("products").doc(productId);

    const result = await db.runTransaction(async (tx) => {
      const productSnap = await tx.get(productRef);
      if (!productSnap.exists) throw new Error("not-found");
      const product = productSnap.data()!;
      if (!product.auctionEnabled) throw new Error("not-auction");
      if (product.sellerId !== uid) throw new Error("forbidden");
      if (product.auctionStatus !== "active") throw new Error("already-ended");

      const winnerId = product.auctionHighestBidderId as string | null;
      tx.update(productRef, { auctionStatus: "ended", auctionEndedAt: Date.now() });

      if (!winnerId) {
        return { hasWinner: false as const, productName: product.name as string };
      }

      const winningBidQuery = await tx.get(
        db.collection("auctionBids").where("productId", "==", productId).where("bidderId", "==", winnerId).where("status", "==", "held")
      );
      const winningBid = winningBidQuery.docs[0];
      if (!winningBid) throw new Error("bid-not-found"); // не должно случаться, но на всякий случай

      const amount = winningBid.data().amount as number;
      tx.update(winningBid.ref, { status: "won" });

      const orderRef = db.collection("orders").doc();
      tx.set(orderRef, {
        userId: winnerId,
        sellerId: uid,
        items: [{ productId, name: product.name, price: amount, quantity: 1 }],
        total: amount,
        status: "pending_confirmation",
        createdAt: Date.now(),
      });

      // Тот же способ выдачи, что продавец выбрал для товара при его создании — как и для
      // обычных покупок (см. api/orders/checkout).
      const method = product.deliveryMethod === "bot" ? "bot" : "seller";
      tx.set(db.collection("deliveries").doc(orderRef.id), {
        orderId: orderRef.id,
        source: "purchase",
        buyerId: winnerId,
        sellerId: uid,
        productId,
        productName: product.name,
        gameId: product.gameId ?? "",
        method,
        status: method === "bot" ? "awaiting_nickname" : "delivered",
        createdAt: Date.now(),
      });

      const winnerName = (product.auctionHighestBidderName as string) ?? "Победитель";
      tx.set(db.collection("publicActivity").doc(), {
        buyerNickMasked: maskNickname(winnerName),
        productName: product.name,
        image: product.image ?? null,
        price: amount,
        type: "purchase",
        createdAt: Date.now(),
      });

      tx.update(db.collection("products").doc(productId), { stock: 0 });

      return { hasWinner: true as const, winnerId, amount, productName: product.name as string, orderId: orderRef.id };
    });

    if (result.hasWinner) {
      notifyTelegramServer(result.winnerId, `🏆 Вы выиграли аукцион «${result.productName}» за ${result.amount} ₽! Заказ уже оформлен.`);
      sendWebPush(result.winnerId, { title: "Вы выиграли аукцион!", body: `«${result.productName}» — ${result.amount} ₽`, url: "/profile/orders" }, "purchases");
    }

    return NextResponse.json({ ok: true, hasWinner: result.hasWinner });
  } catch (err: any) {
    const messages: Record<string, string> = {
      "not-found": "Товар не найден",
      "not-auction": "Это не аукционный товар",
      forbidden: "Это не ваш товар",
      "already-ended": "Аукцион уже завершён",
      "bid-not-found": "Не удалось найти выигрышную ставку",
    };
    if (err?.message && messages[err.message]) {
      return NextResponse.json({ error: messages[err.message] }, { status: 400 });
    }
    console.error("auctions/end error:", err);
    return NextResponse.json({ error: "Не удалось завершить аукцион" }, { status: 500 });
  }
}
