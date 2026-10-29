import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebaseAdmin";
import { syncSellerRating } from "@/lib/reviewStats";

export const runtime = "nodejs";

/**
 * Пересчитывает рейтинг продавца по его отзывам. Вызывается после создания отзыва (lib/reviews.ts).
 * Безопасно для любого вошедшего пользователя: значения берутся только из базы отзывов, а не из запроса.
 * Тело: { sellerId: string }.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const idToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    const decoded = await adminAuth().verifyIdToken(idToken).catch(() => null);
    if (!decoded) return NextResponse.json({ error: "Сессия истекла" }, { status: 401 });

    const { sellerId } = (await req.json().catch(() => ({}))) as { sellerId?: string };
    if (typeof sellerId !== "string" || !sellerId || sellerId === "store") {
      return NextResponse.json({ error: "Не указан продавец" }, { status: 400 });
    }
    const stats = await syncSellerRating(sellerId);
    return NextResponse.json({ ok: true, ...stats });
  } catch (err) {
    console.error("reviews/sync error:", err);
    return NextResponse.json({ error: "Не удалось пересчитать рейтинг" }, { status: 500 });
  }
}
