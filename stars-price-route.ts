import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

const MIN_STARS_PRICE = 15;

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const idToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const decoded = await adminAuth().verifyIdToken(idToken).catch(() => null);
    if (!decoded) return NextResponse.json({ error: "Сессия истекла" }, { status: 401 });
    const uid = decoded.uid;

    const { productId, starsPrice } = (await req.json()) as { productId: string; starsPrice: number | null };
    if (!productId) return NextResponse.json({ error: "Не указан товар" }, { status: 400 });

    const db = adminDb();

    const productRef = db.collection("products").doc(productId);
    const productSnap = await productRef.get();
    if (!productSnap.exists) return NextResponse.json({ error: "Товар не найден" }, { status: 404 });
    if (productSnap.data()?.sellerId !== uid) {
      return NextResponse.json({ error: "Это не ваш товар" }, { status: 403 });
    }

    // null/0 — отключить оплату Stars для товара, это разрешено всегда без проверки верификации.
    if (starsPrice === null || starsPrice === 0) {
      await productRef.update({ starsPrice: null });
      return NextResponse.json({ ok: true, starsPrice: null });
    }

    if (!Number.isFinite(starsPrice) || starsPrice < MIN_STARS_PRICE || !Number.isInteger(starsPrice)) {
      return NextResponse.json({ error: `Цена в Stars — целое число от ${MIN_STARS_PRICE}` }, { status: 400 });
    }

    // Раньше здесь была проверка на бейдж верификации (CHECKMARK_BADGES) — оплата Stars была
    // доступна только верифицированным продавцам. Теперь доступно всем продавцам без ограничений.
    await productRef.update({ starsPrice });
    return NextResponse.json({ ok: true, starsPrice });
  } catch (err) {
    console.error("products/stars-price error:", err);
    return NextResponse.json({ error: "Не удалось сохранить цену в Stars" }, { status: 500 });
  }
}
