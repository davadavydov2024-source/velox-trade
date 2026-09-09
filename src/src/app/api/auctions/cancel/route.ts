import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { notifyTelegramServer } from "@/lib/telegramNotifyServer";
import { sendWebPush } from "@/lib/webPushServer";

export const runtime = "nodejs";

// Продавец передумал проводить аукцион до его завершения — возвращаем деньги текущему лидеру
// (если ставки были) и закрываем торги без создания заказа.
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

      const heldBidsSnap = await tx.get(db.collection("auctionBids").where("productId", "==", productId).where("status", "==", "held"));
      heldBidsSnap.docs.forEach((d) => {
        const bid = d.data();
        tx.update(db.collection("users").doc(bid.bidderId), { balance: FieldValue.increment(bid.amount) });
        tx.update(d.ref, { status: "refunded", refundedAt: Date.now() });
      });

      tx.update(productRef, {
        auctionStatus: "ended",
        auctionEndedAt: Date.now(),
        auctionHighestBidderId: null,
        auctionHighestBidderName: null,
      });

      return {
        productName: product.name as string,
        refundedBidderIds: heldBidsSnap.docs.map((d) => d.data().bidderId as string),
      };
    });

    result.refundedBidderIds.forEach((bidderId) => {
      notifyTelegramServer(bidderId, `❌ Аукцион «${result.productName}» отменён продавцом. Ставка возвращена на баланс.`);
      sendWebPush(bidderId, { title: "Аукцион отменён", body: `«${result.productName}» — ставка возвращена`, url: "/profile" }, "purchases");
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    const messages: Record<string, string> = {
      "not-found": "Товар не найден",
      "not-auction": "Это не аукционный товар",
      forbidden: "Это не ваш товар",
      "already-ended": "Аукцион уже завершён",
    };
    if (err?.message && messages[err.message]) {
      return NextResponse.json({ error: messages[err.message] }, { status: 400 });
    }
    console.error("auctions/cancel error:", err);
    return NextResponse.json({ error: "Не удалось отменить аукцион" }, { status: 500 });
  }
}
