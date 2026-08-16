import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

const MAX_EXTRA_BALANCE = 100_000;

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const idToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const decoded = await adminAuth().verifyIdToken(idToken).catch(() => null);
    if (!decoded) return NextResponse.json({ error: "Сессия истекла" }, { status: 401 });
    const uid = decoded.uid;

    const { offeredProductId, requestedProductId, extraBalance, message } = await req.json();
    if (typeof offeredProductId !== "string" || typeof requestedProductId !== "string") {
      return NextResponse.json({ error: "Не указаны товары для обмена" }, { status: 400 });
    }
    if (offeredProductId === requestedProductId) {
      return NextResponse.json({ error: "Нельзя предложить обмен товара на самого себя" }, { status: 400 });
    }
    const extra = Number(extraBalance) || 0;
    if (extra < 0 || extra > MAX_EXTRA_BALANCE) {
      return NextResponse.json({ error: "Некорректная сумма доплаты" }, { status: 400 });
    }
    const trimmedMessage = typeof message === "string" ? message.trim().slice(0, 300) : "";

    const db = adminDb();

    const [userSnap, offeredSnap, requestedSnap] = await Promise.all([
      db.collection("users").doc(uid).get(),
      db.collection("products").doc(offeredProductId).get(),
      db.collection("products").doc(requestedProductId).get(),
    ]);

    if (!userSnap.exists) return NextResponse.json({ error: "Профиль не найден" }, { status: 404 });
    if (userSnap.data()?.banned) return NextResponse.json({ error: "Аккаунт заблокирован" }, { status: 403 });
    if (!offeredSnap.exists || !requestedSnap.exists) {
      return NextResponse.json({ error: "Один из товаров больше не существует" }, { status: 404 });
    }

    const offered = offeredSnap.data() as { sellerId: string; name: string; image?: string; gameId: string; stock: number };
    const requested = requestedSnap.data() as { sellerId: string; name: string; image?: string; gameId: string; stock: number };

    if (offered.sellerId !== uid) {
      return NextResponse.json({ error: "Ты можешь предлагать только свои товары" }, { status: 403 });
    }
    if (requested.sellerId === uid) {
      return NextResponse.json({ error: "Нельзя предложить обмен на свой же товар" }, { status: 400 });
    }
    if ((offered.stock ?? 0) < 1 || (requested.stock ?? 0) < 1) {
      return NextResponse.json({ error: "Один из товаров сейчас не в наличии" }, { status: 400 });
    }

    // Товары, запертые под колесо фортуны, нельзя ни купить, ни обменять — та же логика,
    // что и в getPurchasableProductById на клиенте (см. src/lib/wheelPrizes.ts).
    const wheelSnap = await db.collection("wheelPrizes").where("type", "==", "product").get();
    const lockedIds = new Set<string>();
    wheelSnap.docs.forEach((d) => {
      const data = d.data() as { productId?: string; remaining?: number };
      if ((data.remaining ?? 0) > 0 && data.productId) lockedIds.add(data.productId);
    });
    if (lockedIds.has(offeredProductId) || lockedIds.has(requestedProductId)) {
      return NextResponse.json({ error: "Один из товаров сейчас недоступен для сделок (разыгрывается в колесе фортуны)" }, { status: 400 });
    }

    if (extra > 0 && (userSnap.data()?.balance ?? 0) < extra) {
      return NextResponse.json({ error: "Недостаточно баланса для доплаты" }, { status: 400 });
    }

    const tradeRef = db.collection("tradeOffers").doc();
    await tradeRef.set({
      fromUserId: uid,
      fromUserNick: userSnap.data()?.displayName ?? "Игрок",
      toUserId: requested.sellerId,
      toUserNick: (await db.collection("users").doc(requested.sellerId).get()).data()?.displayName ?? "Игрок",
      offeredProductId,
      offeredProductName: offered.name,
      offeredProductImage: offered.image ?? null,
      offeredGameId: offered.gameId,
      requestedProductId,
      requestedProductName: requested.name,
      requestedProductImage: requested.image ?? null,
      requestedGameId: requested.gameId,
      ...(extra > 0 ? { extraBalanceFromProposer: extra } : {}),
      ...(trimmedMessage ? { message: trimmedMessage } : {}),
      status: "pending",
      createdAt: Date.now(),
    });

    return NextResponse.json({ ok: true, tradeId: tradeRef.id });
  } catch (err) {
    console.error("trades/create error:", err);
    return NextResponse.json({ error: "Не удалось создать предложение обмена" }, { status: 500 });
  }
}
