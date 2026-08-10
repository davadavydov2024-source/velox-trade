import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { notifyTelegramServer } from "@/lib/telegramNotifyServer";

export const runtime = "nodejs";

function isAdminUid(uid: string): boolean {
  const list = (process.env.NEXT_PUBLIC_ADMIN_UIDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return list.includes(uid);
}

/**
 * Правила Firestore не дают читать чужие "favorites" с клиента (иначе можно было бы узнать,
 * что понравилось другим людям) — поэтому кто добавил товар в избранное, можно узнать только
 * отсюда, через Admin SDK. Вызывается из админки после сохранения товара, если цена упала
 * или товар снова появился в наличии — не блокирует само сохранение, если упадёт.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const idToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const decoded = await adminAuth().verifyIdToken(idToken).catch(() => null);
    if (!decoded || !isAdminUid(decoded.uid)) {
      return NextResponse.json({ error: "Доступ только для администраторов" }, { status: 403 });
    }

    const { productId, productName, oldPrice, newPrice, oldStock, newStock } = await req.json();
    if (!productId) return NextResponse.json({ error: "productId обязателен" }, { status: 400 });

    const priceDropped = typeof oldPrice === "number" && typeof newPrice === "number" && newPrice < oldPrice;
    const backInStock = typeof oldStock === "number" && typeof newStock === "number" && oldStock <= 0 && newStock > 0;
    if (!priceDropped && !backInStock) return NextResponse.json({ notified: 0 });

    const db = adminDb();
    const favSnap = await db.collection("favorites").where("productId", "==", productId).get();
    const uids = favSnap.docs.map((d) => d.data().uid as string);

    const text = priceDropped
      ? `💸 Цена на «${productName}» из избранного снизилась: ${oldPrice} → ${newPrice} ₽`
      : `📦 «${productName}» из избранного снова в наличии`;

    await Promise.all(uids.map((uid) => notifyTelegramServer(uid, text)));

    return NextResponse.json({ notified: uids.length });
  } catch (err) {
    console.error("notify-price-change error:", err);
    return NextResponse.json({ error: "Не удалось отправить уведомления" }, { status: 500 });
  }
}
