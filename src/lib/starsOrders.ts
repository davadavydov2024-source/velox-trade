import { adminDb } from "./firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { notifyTelegramServer } from "./telegramNotifyServer";
import { sendWebPush } from "./webPushServer";
import { maskNickname } from "./maskNickname";

/**
 * Вызывается из вебхука бота на message.successful_payment, когда invoice_payload начинается с
 * "stars_" (см. api/telegram/stars/invoice/route.ts, где счёт создаётся). Идемпотентна: если
 * счёт уже помечен "paid" (Telegram иногда шлёт один и тот же update повторно), просто выходит,
 * не создавая заказ второй раз.
 *
 * Возвращает текст, который бот отправит покупателю в чат сразу после оплаты.
 */
export async function fulfillStarsInvoice(invoiceId: string, starsAmount: number): Promise<string> {
  const db = adminDb();
  const invoiceRef = db.collection("starsInvoices").doc(invoiceId);

  const result = await db.runTransaction(async (tx) => {
    const invoiceSnap = await tx.get(invoiceRef);
    if (!invoiceSnap.exists) throw new Error("invoice-not-found");
    const invoice = invoiceSnap.data() as {
      buyerId: string;
      productId: string;
      quantity: number;
      sellerId: string;
      status: string;
    };
    if (invoice.status === "paid") return { alreadyPaid: true as const };

    const productRef = db.collection("products").doc(invoice.productId);
    const productSnap = await tx.get(productRef);
    if (!productSnap.exists) throw new Error("product-not-found");
    const product = productSnap.data() as { name: string; price: number; stock: number; gameId: string; image?: string; discountPercent?: number };

    const buyerRef = db.collection("users").doc(invoice.buyerId);
    const buyerSnap = await tx.get(buyerRef);
    const buyerNick: string = buyerSnap.exists ? buyerSnap.data()?.displayName ?? "Покупатель" : "Покупатель";

    // Звёзды уже списаны у покупателя Telegram-ом к этому моменту — вернуть их нельзя, поэтому
    // при нехватке остатка всё равно создаём заказ (deliveryMethod/склад продавец разрулит
    // вручную через поддержку), а не отменяем оплаченную сделку молча.
    const stockLeft = Math.max(0, (product.stock ?? 0) - invoice.quantity);
    tx.update(productRef, { stock: stockLeft });

    const unitPrice = +(product.discountPercent ? product.price * (1 - product.discountPercent / 100) : product.price).toFixed(2);
    const total = +(unitPrice * invoice.quantity).toFixed(2);

    const orderRef = db.collection("orders").doc();
    tx.set(orderRef, {
      userId: invoice.buyerId,
      sellerId: invoice.sellerId,
      items: [{ productId: invoice.productId, name: product.name, price: unitPrice, quantity: invoice.quantity }],
      total,
      paymentMethod: "telegram_stars",
      starsAmount,
      status: "pending_confirmation",
      createdAt: Date.now(),
    });

    tx.set(db.collection("deliveries").doc(orderRef.id), {
      orderId: orderRef.id,
      source: "purchase",
      buyerId: invoice.buyerId,
      sellerId: invoice.sellerId,
      productId: invoice.productId,
      productName: product.name,
      gameId: product.gameId,
      status: "awaiting_nickname",
      createdAt: Date.now(),
    });

    tx.set(db.collection("publicActivity").doc(), {
      buyerNickMasked: maskNickname(buyerNick),
      productName: product.name,
      image: product.image ?? null,
      price: total,
      type: "purchase",
      createdAt: Date.now(),
    });

    tx.update(invoiceRef, { status: "paid", paidAt: Date.now(), orderId: orderRef.id });

    // Начисляем продавцу Stars сразу — Telegram уже реально удержал их с покупателя в пользу бота
    // в момент successful_payment. Выводит их продавец потом через бота от 15 ⭐ (см.
    // telegramStarsWithdrawals.ts) — это отдельный, не рублёвый баланс (starsBalance), 48-часовой
    // холд обычных покупок (см. api/orders/confirm-receipt) сюда не относится.
    tx.update(db.collection("users").doc(invoice.sellerId), { starsBalance: FieldValue.increment(starsAmount) });

    db.collection("stats").doc("public").set({ dealsCount: FieldValue.increment(1) }, { merge: true }).catch(() => {});

    return { alreadyPaid: false as const, sellerId: invoice.sellerId, productName: product.name, quantity: invoice.quantity };
  });

  if (result.alreadyPaid) {
    return `Счёт на ${starsAmount} ⭐ уже был оплачен ранее — заказ создан, ищи его в «Мои заказы» на сайте.`;
  }

  notifyTelegramServer(result.sellerId, `⭐ У вас купили за Telegram Stars: «${result.productName}» × ${result.quantity} — на баланс зачислено ${starsAmount} ⭐. Посмотреть баланс: «⭐ Stars» в меню бота.`);
  sendWebPush(result.sellerId, { title: "У вас купили товар", body: `${result.productName} × ${result.quantity} — оплачено Stars`, url: "/profile/sales" }, "purchases");

  return `Оплата ${starsAmount} ⭐ прошла успешно! «${result.productName}» уже оформлен(ы) — заказ появится в «Мои заказы» на сайте, продавец подтвердит выдачу.`;
}
