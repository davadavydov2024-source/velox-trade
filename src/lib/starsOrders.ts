import { adminDb } from "./firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { notifyTelegramServer } from "./telegramNotifyServer";
import { sendWebPush } from "./webPushServer";
import { maskNickname } from "./maskNickname";
import { refundStarPayment } from "./telegramBot";
import { getPaymentMode } from "@/types";

/** Счёт на оплату живёт сутки: дальше цена/наличие почти наверняка устарели. */
const INVOICE_TTL_MS = 24 * 60 * 60 * 1000;

interface InvoiceDoc {
  buyerId: string;
  productId: string;
  quantity: number;
  sellerId: string;
  amountStars: number;
  status: "pending" | "paid" | "failed" | "refunding" | "refunded";
  createdAt: number;
  telegramChargeId?: string;
  payerTgId?: number;
  orderId?: string;
}

export type PreCheckoutResult = { ok: true } | { ok: false; message: string };

/**
 * Проверка ПЕРЕД списанием звёзд — вызывается на pre_checkout_query. Раньше бот отвечал «ок» на любой
 * запрос вслепую, и человек платил за товар, которого уже нет, который удалили или у которого
 * сменилась цена — звёзды списывались, а нормального заказа не получалось. Если вернули ok:false,
 * Telegram покажет message прямо в окне оплаты, и деньги НЕ спишутся.
 * Донаты (payload не "stars_") пропускаем как раньше.
 */
export async function validateStarsPreCheckout(payload: string, totalAmount: number): Promise<PreCheckoutResult> {
  if (!payload.startsWith("stars_")) return { ok: true };
  const db = adminDb();
  const invoiceSnap = await db.collection("starsInvoices").doc(payload.slice("stars_".length)).get();
  if (!invoiceSnap.exists) return { ok: false, message: "Счёт не найден. Создай новый на странице товара." };
  const invoice = invoiceSnap.data() as InvoiceDoc;
  if (invoice.status !== "pending") return { ok: false, message: "Этот счёт уже оплачен или закрыт." };
  if (Date.now() - invoice.createdAt > INVOICE_TTL_MS) return { ok: false, message: "Счёт устарел. Создай новый на странице товара." };

  const productSnap = await db.collection("products").doc(invoice.productId).get();
  if (!productSnap.exists) return { ok: false, message: "Товар удалён продавцом." };
  const product = productSnap.data() as { stock: number; sellerId: string; starsPrice?: number; paymentMode?: "rub" | "stars" | "both" };
  if ((product as { banned?: boolean }).banned) return { ok: false, message: "Товар заблокирован модерацией." };
  if (getPaymentMode(product) === "rub") return { ok: false, message: "Продавец отключил оплату Stars для этого товара." };
  if ((product.stock ?? 0) < invoice.quantity) return { ok: false, message: "Товара уже нет в наличии." };
  if (product.sellerId !== invoice.sellerId) return { ok: false, message: "Товар изменился. Создай новый счёт." };
  const expected = (product.starsPrice ?? 0) * invoice.quantity;
  if (expected !== invoice.amountStars || totalAmount !== invoice.amountStars) {
    return { ok: false, message: "Цена товара изменилась. Создай новый счёт на странице товара." };
  }
  return { ok: true };
}

/** Запись о платеже, который не удалось обработать автоматически — чтобы админ мог разобраться вручную,
 * а не искать по логам, куда делись звёзды. */
export async function logStarsIssue(data: Record<string, unknown>) {
  await adminDb()
    .collection("starsPaymentIssues")
    .add({ ...data, createdAt: Date.now(), resolved: false })
    .catch((e) => console.error("logStarsIssue:", e));
}

/**
 * Вызывается из вебхука бота на message.successful_payment, когда invoice_payload начинается с
 * "stars_". Идемпотентна (повторный update от Telegram ничего не дублирует).
 *
 * Что происходит при успехе:
 *  • создаётся заказ (paymentMethod "telegram_stars", total в рублях = 0 — рублёвых денег тут нет, поэтому
 *    api/orders/confirm-receipt не создаёт для него рублёвую выплату: раньше продавец получал и Stars,
 *    и рубли сверху);
 *  • starsBalance продавца увеличивается на оплаченную сумму — это тот самый баланс, что виден в боте
 *    («⭐ Stars-баланс») и выводится оттуда.
 * Если заказ оформить нельзя (товар удалили/раскупили между оплатой и обработкой) — звёзды автоматически
 * возвращаются покупателю через refundStarPayment, а не «зависают».
 */
export async function fulfillStarsInvoice(
  invoiceId: string,
  starsAmount: number,
  payment: { chargeId?: string; payerTgId?: number } = {}
): Promise<string> {
  const db = adminDb();
  const invoiceRef = db.collection("starsInvoices").doc(invoiceId);

  const result = await db.runTransaction(async (tx) => {
    // Firestore: в транзакции все чтения — до записей.
    const invoiceSnap = await tx.get(invoiceRef);
    if (!invoiceSnap.exists) throw new Error("invoice-not-found");
    const invoice = invoiceSnap.data() as InvoiceDoc;
    if (invoice.status === "paid" || invoice.status === "refunded" || invoice.status === "refunding") {
      return { kind: "already" as const };
    }

    const productRef = db.collection("products").doc(invoice.productId);
    const productSnap = await tx.get(productRef);
    const buyerSnap = await tx.get(db.collection("users").doc(invoice.buyerId));
    const buyerNick: string = buyerSnap.exists ? buyerSnap.data()?.displayName ?? "Покупатель" : "Покупатель";

    const chargeInfo = { telegramChargeId: payment.chargeId ?? null, payerTgId: payment.payerTgId ?? null };

    const product = productSnap.exists
      ? (productSnap.data() as { name: string; stock: number; gameId: string; image?: string })
      : null;
    const failReason = !product ? "товар удалён" : (product.stock ?? 0) < invoice.quantity ? "товар уже раскупили" : null;
    if (failReason || !product) {
      tx.update(invoiceRef, { status: "failed", failReason, paidStars: starsAmount, ...chargeInfo });
      return { kind: "failed" as const, reason: failReason ?? "товар недоступен" };
    }

    tx.update(productRef, { stock: (product.stock ?? 0) - invoice.quantity });

    const orderRef = db.collection("orders").doc();
    tx.set(orderRef, {
      userId: invoice.buyerId,
      sellerId: invoice.sellerId,
      items: [{ productId: invoice.productId, name: product.name, price: 0, quantity: invoice.quantity }],
      total: 0, // рублёвой суммы нет — см. starsAmount; так рублёвые потоки (выплата, возврат, выручка) не трогают Stars-заказ
      paymentMethod: "telegram_stars",
      starsAmount,
      starsInvoiceId: invoiceId,
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
      price: 0,
      stars: starsAmount,
      type: "purchase",
      createdAt: Date.now(),
    });

    tx.update(invoiceRef, { status: "paid", paidAt: Date.now(), orderId: orderRef.id, paidStars: starsAmount, ...chargeInfo });

    // ЗАЧИСЛЕНИЕ ЗВЁЗД ПРОДАВЦУ. set+merge, а не update: если по какой-то причине документа продавца нет,
    // update бросил бы ошибку и ВСЯ транзакция откатилась бы — человек заплатил, а заказа и звёзд нет.
    tx.set(db.collection("users").doc(invoice.sellerId), { starsBalance: FieldValue.increment(starsAmount) }, { merge: true });

    return {
      kind: "ok" as const,
      sellerId: invoice.sellerId,
      productName: product.name,
      quantity: invoice.quantity,
    };
  });

  if (result.kind === "already") {
    return `Счёт на ${starsAmount} ⭐ уже был оплачен ранее — заказ создан, ищи его в «Мои заказы» на сайте.`;
  }

  if (result.kind === "failed") {
    // Заказ оформить нельзя — возвращаем звёзды сразу, не заставляя писать в поддержку.
    const refunded = payment.payerTgId && payment.chargeId ? await refundStarPayment(payment.payerTgId, payment.chargeId) : false;
    await invoiceRef.update({ status: refunded ? "refunded" : "failed", ...(refunded ? { refundedAt: Date.now() } : {}) }).catch(() => {});
    if (!refunded) {
      await logStarsIssue({ type: "fulfill-failed-refund-failed", invoiceId, starsAmount, reason: result.reason, ...payment });
      return `Оплата ${starsAmount} ⭐ прошла, но ${result.reason}, а вернуть звёзды автоматически не вышло. Напиши в поддержку на сайте — вернём вручную.`;
    }
    return `К сожалению, ${result.reason}. Оплаченные ${starsAmount} ⭐ уже возвращены тебе в Telegram.`;
  }

  notifyTelegramServer(
    result.sellerId,
    `⭐ У вас купили за Telegram Stars: «${result.productName}» × ${result.quantity} — на баланс зачислено ${starsAmount} ⭐. Посмотреть баланс: «⭐ Stars-баланс» в меню бота.`
  );
  sendWebPush(result.sellerId, { title: "У вас купили товар", body: `${result.productName} × ${result.quantity} — оплачено Stars`, url: "/profile/sales" }, "purchases");

  return `Оплата ${starsAmount} ⭐ прошла успешно! «${result.productName}» уже оформлен(ы) — заказ появится в «Мои заказы» на сайте, продавец подтвердит выдачу.`;
}

export type RefundResult = { ok: true; alreadyRefunded?: boolean } | { ok: false; error: string };

/**
 * Возврат звёзд по Stars-заказу (отмена продавцом, возврат администратором): списывает их с starsBalance
 * продавца (баланс может уйти в минус, если он уже вывел — тогда вывод закрыт, пока не «отработает» долг)
 * и возвращает покупателю через Telegram. Идемпотентно: повторный вызов после успеха ничего не делает,
 * а при сбое Telegram баланс продавца откатывается — звёзды не пропадают ни у кого.
 */
export async function refundStarsOrder(orderId: string): Promise<RefundResult> {
  const db = adminDb();
  const orderSnap = await db.collection("orders").doc(orderId).get();
  const order = orderSnap.data() as { paymentMethod?: string; starsInvoiceId?: string; starsAmount?: number; sellerId?: string } | undefined;
  if (!order || order.paymentMethod !== "telegram_stars" || !order.starsInvoiceId) return { ok: false, error: "Это не заказ за Stars" };

  const invoiceRef = db.collection("starsInvoices").doc(order.starsInvoiceId);
  const sellerRef = db.collection("users").doc(order.sellerId!);

  let invoice: InvoiceDoc | null = null;
  let already = false;
  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(invoiceRef);
      if (!snap.exists) throw new Error("no-invoice");
      invoice = snap.data() as InvoiceDoc;
      if (invoice.status === "refunded") {
        already = true;
        return;
      }
      if (invoice.status === "refunding") throw new Error("busy");
      if (!invoice.telegramChargeId || !invoice.payerTgId) throw new Error("no-charge");
      tx.update(invoiceRef, { status: "refunding" });
      tx.set(sellerRef, { starsBalance: FieldValue.increment(-(order.starsAmount ?? invoice.amountStars)) }, { merge: true });
    });
  } catch (e: any) {
    const map: Record<string, string> = {
      "no-invoice": "Счёт на оплату не найден",
      busy: "Возврат уже выполняется",
      "no-charge": "Нет данных платежа Telegram для автоматического возврата — верни звёзды вручную",
    };
    return { ok: false, error: map[e?.message] ?? "Не удалось начать возврат" };
  }
  if (already) return { ok: true, alreadyRefunded: true };

  const inv = invoice as unknown as InvoiceDoc;
  const amount = order.starsAmount ?? inv.amountStars;
  const done = await refundStarPayment(inv.payerTgId!, inv.telegramChargeId!);
  if (!done) {
    // Telegram отказал — возвращаем всё как было, чтобы продавец не потерял звёзды зря.
    await db.runTransaction(async (tx) => {
      tx.update(invoiceRef, { status: "paid" });
      tx.set(sellerRef, { starsBalance: FieldValue.increment(amount) }, { merge: true });
    });
    return { ok: false, error: "Telegram не смог вернуть звёзды (возможно, платёж слишком старый или бот заблокирован)" };
  }
  await invoiceRef.update({ status: "refunded", refundedAt: Date.now() }).catch(() => {});
  return { ok: true };
}
