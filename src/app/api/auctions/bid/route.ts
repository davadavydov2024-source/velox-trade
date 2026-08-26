import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb, verifyAppCheck } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { notifyTelegramServer } from "@/lib/telegramNotifyServer";
import { sendWebPush } from "@/lib/webPushServer";

export const runtime = "nodejs";

// Сделать ставку в аукционе. Деньги блокируются на балансе сразу (как обычная покупка), а не
// просто записываются числом — если аукцион отменят/зависнет без ответа продавца, у площадки уже
// есть эти деньги и их гарантированно можно вернуть, а не просить победителя оплатить постфактум,
// когда он уже мог передумать или потратить баланс на что-то другое.
export async function POST(req: NextRequest) {
  try {
    if (!(await verifyAppCheck(req))) return NextResponse.json({ error: "Проверка безопасности не пройдена" }, { status: 403 });

    const authHeader = req.headers.get("authorization");
    const idToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const decoded = await adminAuth().verifyIdToken(idToken).catch(() => null);
    if (!decoded) return NextResponse.json({ error: "Сессия истекла" }, { status: 401 });
    const uid = decoded.uid;

    const { productId, amount } = await req.json();
    if (typeof productId !== "string" || !productId) return NextResponse.json({ error: "Не указан товар" }, { status: 400 });
    if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "Некорректная сумма ставки" }, { status: 400 });
    }

    const db = adminDb();
    const productRef = db.collection("products").doc(productId);
    const bidderRef = db.collection("users").doc(uid);

    const result = await db.runTransaction(async (tx) => {
      const [productSnap, bidderSnap] = await Promise.all([tx.get(productRef), tx.get(bidderRef)]);
      if (!productSnap.exists) throw new Error("not-found");
      const product = productSnap.data()!;
      if (!product.auctionEnabled) throw new Error("not-auction");
      if (product.auctionStatus !== "active") throw new Error("ended");
      if (product.sellerId === uid) throw new Error("own-item");

      if (!bidderSnap.exists) throw new Error("no-profile");
      const bidder = bidderSnap.data()!;
      if (bidder.banned) throw new Error("banned");

      const currentPrice = (product.auctionCurrentPrice ?? product.auctionStartPrice ?? 0) as number;
      const minStep = (product.auctionMinStep ?? 1) as number;
      const minRequired = product.auctionBidCount ? currentPrice + minStep : currentPrice;
      if (amount < minRequired) throw new Error("too-low");

      const balance = (bidder.balance ?? 0) as number;
      if (balance < amount) throw new Error("insufficient-balance");

      const prevBidderId = (product.auctionHighestBidderId ?? null) as string | null;
      const prevAmount = (product.auctionCurrentPrice ?? 0) as number;
      // Тот же человек перебивает собственную же ставку (поднимает лимит) — тогда возвращаем
      // разницу, а не весь прежний платёж целиком, и не создаём вторую отдельную запись held.
      const isSameBidderRaising = prevBidderId === uid;

      if (prevBidderId && !isSameBidderRaising) {
        // Автовозврат предыдущему лидеру — его ставка была held, теперь она перебита.
        tx.update(db.collection("users").doc(prevBidderId), { balance: FieldValue.increment(prevAmount) });
        const prevBidQuery = await tx.get(
          db.collection("auctionBids").where("productId", "==", productId).where("bidderId", "==", prevBidderId).where("status", "==", "held")
        );
        prevBidQuery.docs.forEach((d) => tx.update(d.ref, { status: "refunded", refundedAt: Date.now() }));
      }

      const toCharge = isSameBidderRaising ? amount - prevAmount : amount;
      tx.update(bidderRef, { balance: FieldValue.increment(-toCharge) });

      if (isSameBidderRaising) {
        // Поднимаем уже существующую held-ставку той же суммой вместо двух параллельных записей.
        const ownBidQuery = await tx.get(
          db.collection("auctionBids").where("productId", "==", productId).where("bidderId", "==", uid).where("status", "==", "held")
        );
        ownBidQuery.docs.forEach((d) => tx.update(d.ref, { amount }));
      } else {
        const bidRef = db.collection("auctionBids").doc();
        tx.set(bidRef, {
          id: bidRef.id,
          productId,
          sellerId: product.sellerId,
          bidderId: uid,
          bidderName: bidder.displayName ?? bidder.email ?? "Игрок",
          amount,
          status: "held",
          createdAt: Date.now(),
        });
      }

      tx.update(productRef, {
        auctionCurrentPrice: amount,
        auctionHighestBidderId: uid,
        auctionHighestBidderName: bidder.displayName ?? bidder.email ?? "Игрок",
        auctionBidCount: FieldValue.increment(1),
      });

      return { sellerId: product.sellerId as string, productName: product.name as string, prevBidderId, isSameBidderRaising };
    });

    notifyTelegramServer(result.sellerId, `🔨 Новая ставка ${amount} ₽ на «${result.productName}» — торги продолжаются.`);
    sendWebPush(result.sellerId, { title: "Новая ставка в аукционе", body: `«${result.productName}» — ${amount} ₽`, url: "/profile/my-products" }, "purchases");
    if (result.prevBidderId && !result.isSameBidderRaising) {
      notifyTelegramServer(result.prevBidderId, `📉 Вашу ставку на «${result.productName}» перебили. Деньги возвращены на баланс.`);
      sendWebPush(result.prevBidderId, { title: "Ставку перебили", body: `«${result.productName}» — деньги возвращены`, url: `/product/${productId}` }, "purchases");
    }

    return NextResponse.json({ ok: true, amount });
  } catch (err: any) {
    const messages: Record<string, string> = {
      "not-found": "Товар не найден",
      "not-auction": "Это не аукционный товар",
      ended: "Аукцион уже завершён",
      "own-item": "Нельзя делать ставки на собственный товар",
      "no-profile": "Профиль не найден",
      banned: "Аккаунт заблокирован",
      "too-low": "Ставка должна быть выше текущей минимум на шаг аукциона",
      "insufficient-balance": "Недостаточно средств на балансе",
    };
    if (err?.message && messages[err.message]) {
      return NextResponse.json({ error: messages[err.message] }, { status: 400 });
    }
    console.error("auctions/bid error:", err);
    return NextResponse.json({ error: "Не удалось сделать ставку" }, { status: 500 });
  }
}
