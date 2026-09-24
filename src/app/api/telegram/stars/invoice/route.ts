import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { sendInvoice } from "@/lib/telegramBot";
import { CHECKMARK_BADGES } from "@/types";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const idToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const decoded = await adminAuth().verifyIdToken(idToken).catch(() => null);
    if (!decoded) return NextResponse.json({ error: "Сессия истекла" }, { status: 401 });
    const uid = decoded.uid;

    const { productId, quantity } = (await req.json()) as { productId: string; quantity?: number };
    if (!productId) return NextResponse.json({ error: "Не указан товар" }, { status: 400 });
    const qty = Math.max(1, Math.min(99, Math.floor(quantity ?? 1)));

    const db = adminDb();

    // Покупателю обязательно нужен привязанный Telegram — именно туда мы отправим счёт на оплату.
    const linkSnap = await db.collection("telegramLinks").doc(uid).get();
    if (!linkSnap.exists) {
      return NextResponse.json({ error: "not-linked" }, { status: 400 });
    }
    const { chatId } = linkSnap.data() as { chatId: number };

    const productSnap = await db.collection("products").doc(productId).get();
    if (!productSnap.exists) return NextResponse.json({ error: "Товар не найден" }, { status: 404 });
    const product = productSnap.data() as {
      name: string;
      stock: number;
      sellerId: string;
      starsPrice?: number;
    };
    if (product.stock < qty) {
      return NextResponse.json({ error: `В наличии всего ${product.stock} шт.` }, { status: 400 });
    }
    if (!product.sellerId || product.sellerId === "store") {
      return NextResponse.json({ error: "Оплата Stars доступна только для товаров продавцов" }, { status: 400 });
    }
    // Цена задаётся самим продавцом при создании/редактировании товара (см. profile/my-products) —
    // никакого автоматического курса ₽→⭐ тут больше нет, продавец сам решает, сколько Stars хочет
    // получить за товар.
    if (!product.starsPrice || product.starsPrice <= 0) {
      return NextResponse.json({ error: "Продавец не установил цену в Stars для этого товара" }, { status: 400 });
    }

    // Оплата Stars — только у продавцов с галочкой верификации (checkmark_blue / checkmark_grey).
    // Проверяем на сервере, а не доверяем кнопке на клиенте — иначе можно было бы получить счёт
    // в обход этого ограничения прямым запросом к API. Дополнительно эта же проверка стоит и в
    // api/products/stars-price (нельзя выставить цену не будучи верифицированным), но статус
    // продавца мог измениться (например, галочку сняли) уже после того, как цена была задана —
    // поэтому проверяем ещё раз здесь, на момент самой покупки.
    const sellerSnap = await db.collection("users").doc(product.sellerId).get();
    const sellerBadges: string[] = sellerSnap.exists ? (sellerSnap.data()?.badges ?? []) : [];
    if (!sellerBadges.some((b) => CHECKMARK_BADGES.includes(b as any))) {
      return NextResponse.json({ error: "Продавец не верифицирован" }, { status: 400 });
    }

    const amountStars = product.starsPrice * qty;

    const invoiceRef = db.collection("starsInvoices").doc();
    await invoiceRef.set({
      buyerId: uid,
      productId,
      quantity: qty,
      sellerId: product.sellerId,
      amountStars,
      status: "pending",
      createdAt: Date.now(),
    });

    const sent = await sendInvoice(
      chatId,
      product.name,
      `${qty > 1 ? `${qty} шт. — ` : ""}оплата через Velox Trade`,
      `stars_${invoiceRef.id}`,
      amountStars
    );

    if (!sent) {
      await invoiceRef.delete().catch(() => {});
      return NextResponse.json({ error: "Не удалось отправить счёт в Telegram — проверь, что бот не заблокирован" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, amountStars });
  } catch (err) {
    console.error("telegram/stars/invoice error:", err);
    return NextResponse.json({ error: "Не удалось создать счёт" }, { status: 500 });
  }
}
