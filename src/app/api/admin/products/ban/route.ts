import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { isAdminUid } from "@/lib/users";
import { notifyTelegramServer } from "@/lib/telegramNotifyServer";
import { sendWebPush } from "@/lib/webPushServer";

export const runtime = "nodejs";

/**
 * Блокировка / разблокировка товара админом. Заблокированный товар пропадает из каталога, его нельзя
 * купить, обменять или продвигать (проверки в checkout / stars invoice / trades / auctions / boost).
 * Если у товара идёт аукцион — торги закрываются, а удержанные ставки возвращаются на баланс
 * участникам (иначе их деньги «зависли» бы на заблокированном лоте).
 * Тело: { productId: string, banned: boolean, reason?: string }
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const idToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    const decoded = await adminAuth().verifyIdToken(idToken).catch(() => null);
    if (!decoded) return NextResponse.json({ error: "Сессия истекла" }, { status: 401 });
    if (!isAdminUid(decoded.uid)) return NextResponse.json({ error: "Только для администраторов" }, { status: 403 });

    const { productId, banned, reason } = (await req.json().catch(() => ({}))) as { productId?: string; banned?: boolean; reason?: string };
    if (typeof productId !== "string" || !productId || typeof banned !== "boolean") {
      return NextResponse.json({ error: "Неверные параметры" }, { status: 400 });
    }
    const cleanReason = typeof reason === "string" ? reason.trim().slice(0, 300) : "";
    if (banned && !cleanReason) return NextResponse.json({ error: "Укажи причину блокировки — её увидит продавец" }, { status: 400 });

    const db = adminDb();
    const productRef = db.collection("products").doc(productId);

    const result = await db.runTransaction(async (tx) => {
      const snap = await tx.get(productRef);
      if (!snap.exists) throw new Error("not-found");
      const product = snap.data()!;

      if (!banned) {
        tx.update(productRef, {
          banned: false,
          bannedReason: FieldValue.delete(),
          bannedAt: FieldValue.delete(),
          bannedBy: FieldValue.delete(),
        });
        return { sellerId: product.sellerId as string, name: product.name as string, refundedBidderIds: [] as string[] };
      }

      const update: Record<string, unknown> = { banned: true, bannedReason: cleanReason, bannedAt: Date.now(), bannedBy: decoded.uid };
      let refundedBidderIds: string[] = [];
      if (product.auctionEnabled && product.auctionStatus === "active") {
        const held = await tx.get(db.collection("auctionBids").where("productId", "==", productId).where("status", "==", "held"));
        held.docs.forEach((d) => {
          const bid = d.data();
          tx.update(db.collection("users").doc(bid.bidderId), { balance: FieldValue.increment(bid.amount) });
          tx.update(d.ref, { status: "refunded", refundedAt: Date.now() });
        });
        refundedBidderIds = held.docs.map((d) => d.data().bidderId as string);
        Object.assign(update, { auctionStatus: "ended", auctionEndedAt: Date.now(), auctionHighestBidderId: null, auctionHighestBidderName: null });
      }
      tx.update(productRef, update);
      return { sellerId: product.sellerId as string, name: product.name as string, refundedBidderIds };
    });

    if (result.sellerId && result.sellerId !== "store") {
      if (banned) {
        notifyTelegramServer(result.sellerId, `🚫 Твой товар «${result.name}» заблокирован модерацией. Причина: ${cleanReason}`);
        sendWebPush(result.sellerId, { title: "Товар заблокирован", body: `«${result.name}»: ${cleanReason}`, url: "/profile/my-products" }, "messages");
      } else {
        notifyTelegramServer(result.sellerId, `✅ Твой товар «${result.name}» разблокирован и снова в каталоге.`);
        sendWebPush(result.sellerId, { title: "Товар разблокирован", body: `«${result.name}» снова в каталоге`, url: "/profile/my-products" }, "messages");
      }
    }
    result.refundedBidderIds.forEach((id) => {
      notifyTelegramServer(id, `❌ Аукцион «${result.name}» закрыт модерацией. Ставка возвращена на баланс.`);
      sendWebPush(id, { title: "Аукцион закрыт", body: `«${result.name}» — ставка возвращена`, url: "/profile" }, "purchases");
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    if (err?.message === "not-found") return NextResponse.json({ error: "Товар не найден" }, { status: 404 });
    console.error("admin/products/ban error:", err);
    return NextResponse.json({ error: "Не удалось выполнить действие" }, { status: 500 });
  }
}
