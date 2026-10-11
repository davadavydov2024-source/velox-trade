import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { releaseDuePayouts } from "@/lib/payouts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Сводка денег продавца «в пути»:
 *  • escrow  — покупатель уже заплатил, но ещё НЕ подтвердил получение (деньги заморожены);
 *  • holding — покупатель подтвердил, идёт 48-часовой холд до зачисления на баланс.
 * Заодно зачисляет продавцу выплаты, у которых холд уже закончился (см. lib/payouts.ts), поэтому деньги
 * приходят вовремя и без частого крона. Все запросы — только по равенствам (без составных индексов).
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const idToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    const decoded = await adminAuth().verifyIdToken(idToken).catch(() => null);
    if (!decoded) return NextResponse.json({ error: "Сессия истекла" }, { status: 401 });
    const uid = decoded.uid;

    const { released } = await releaseDuePayouts({ sellerId: uid });

    const db = adminDb();
    const [holdSnap, escrowSnap] = await Promise.all([
      db.collection("pendingPayouts").where("sellerId", "==", uid).where("status", "==", "holding").get(),
      db.collection("orders").where("sellerId", "==", uid).where("status", "==", "pending_confirmation").get(),
    ]);

    const holdingItems = holdSnap.docs
      .map((d) => ({ orderId: d.data().orderId as string, amount: d.data().amount as number, releaseAt: d.data().releaseAt as number }))
      .sort((a, b) => a.releaseAt - b.releaseAt);
    const holdingTotal = holdingItems.reduce((sum, i) => sum + i.amount, 0);

    // Заказы за Stars в рублёвый «эскроу» не входят: звёзды продавцу зачисляются сразу при оплате.
    const escrowOrders = escrowSnap.docs.filter((d) => d.data().paymentMethod !== "telegram_stars");
    const escrowTotal = escrowOrders.reduce((sum, d) => sum + ((d.data().total as number) ?? 0), 0);

    return NextResponse.json({
      released,
      holdingTotal,
      holdingItems,
      escrowTotal,
      escrowCount: escrowOrders.length,
    });
  } catch (err) {
    console.error("payouts/mine error:", err);
    return NextResponse.json({ error: "Не удалось получить сводку" }, { status: 500 });
  }
}
