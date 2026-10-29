import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebaseAdmin";
import { payWithStarsWallet } from "@/lib/starsWallet";

export const runtime = "nodejs";

/** Оплата товара звёздами с баланса ⭐ на сайте. Тело: { productId, quantity? }. */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const idToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    const decoded = await adminAuth().verifyIdToken(idToken).catch(() => null);
    if (!decoded) return NextResponse.json({ error: "Сессия истекла" }, { status: 401 });

    const { productId, quantity } = (await req.json().catch(() => ({}))) as { productId?: string; quantity?: number };
    if (typeof productId !== "string" || !productId) return NextResponse.json({ error: "Не указан товар" }, { status: 400 });
    const qty = Math.max(1, Math.min(99, Math.floor(quantity ?? 1)));

    const result = await payWithStarsWallet(decoded.uid, productId, qty);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true, amountStars: result.amountStars, message: result.message });
  } catch (err) {
    console.error("stars/pay-with-wallet error:", err);
    return NextResponse.json({ error: "Не удалось оплатить с баланса" }, { status: 500 });
  }
}
