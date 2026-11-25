import { adminDb } from "./firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { sendTelegramMessage, sendInvoice } from "./telegramBot";
import { sendWebPush } from "./webPushServer";
import { fulfillStarsInvoice } from "./starsOrders";
import { getPaymentMode } from "@/types";

/**
 * Кошелёк Telegram Stars для ПОКУПОК на сайте (users.starsWallet). Отдельно от starsBalance — это
 * звёзды, заработанные продажами, они выводятся через бота. Кошелёк пополняется оплатой счёта в
 * боте и тратится на товары за ⭐; вывести его нельзя (иначе пополнение превратилось бы в схему
 * обхода комиссий). Каждое движение пишется в журнал starsWalletLog.
 */

export const MIN_TOPUP_STARS = 10;
export const MAX_TOPUP_STARS = 10000;
const TOPUP_TTL_MS = 24 * 60 * 60 * 1000;
export const TOPUP_PAYLOAD_PREFIX = "sttop_";

interface TopupDoc {
  uid: string;
  amount: number;
  status: "pending" | "paid";
  createdAt: number;
  telegramChargeId?: string;
  payerTgId?: number;
}

/** Создаёт заявку на пополнение; её id уходит в ссылку на бота (t.me/bot?start=sttop_<id>). */
export async function createStarsTopup(uid: string, amount: number): Promise<string> {
  const db = adminDb();
  // Не даём засыпать базу заявками: не больше 10 неоплаченных за последний час.
  const recent = await db.collection("starsTopups").where("uid", "==", uid).get();
  const pendingRecent = recent.docs.filter((d) => {
    const t = d.data() as TopupDoc;
    return t.status === "pending" && Date.now() - t.createdAt < 60 * 60 * 1000;
  }).length;
  if (pendingRecent >= 10) throw new Error("too-many");
  const ref = db.collection("starsTopups").doc();
  await ref.set({ uid, amount, status: "pending", createdAt: Date.now() });
  return ref.id;
}

/** Бот получил /start sttop_<id>: проверяем заявку и выставляем счёт. Возвращает текст для пользователя. */
export async function startStarsTopupInBot(topupId: string, chatId: number): Promise<string> {
  const snap = await adminDb().collection("starsTopups").doc(topupId).get();
  if (!snap.exists) return "Заявка на пополнение не найдена. Создай новую на сайте: страница «Пополнение ⭐».";
  const t = snap.data() as TopupDoc;
  if (t.status !== "pending") return "Эта заявка уже оплачена. Баланс ⭐ виден на сайте.";
  if (Date.now() - t.createdAt > TOPUP_TTL_MS) return "Заявка устарела. Создай новую на сайте: страница «Пополнение ⭐».";

  const sent = await sendInvoice(
    chatId,
    "Пополнение баланса ⭐",
    `Зачисление ${t.amount} ⭐ на баланс аккаунта Velox Trade. Звёзды можно тратить на товары за Stars.`,
    `${TOPUP_PAYLOAD_PREFIX}${topupId}`,
    t.amount
  );
  return sent ? `Счёт на ${t.amount} ⭐ отправлен — оплати его выше, и баланс на сайте пополнится сразу.` : "Не удалось отправить счёт. Попробуй ещё раз чуть позже.";
}

/** Проверка ПЕРЕД списанием звёзд (pre_checkout_query) для счетов пополнения. */
export async function validateStarsTopupPreCheckout(payload: string, totalAmount: number): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!payload.startsWith(TOPUP_PAYLOAD_PREFIX)) return { ok: true };
  const snap = await adminDb().collection("starsTopups").doc(payload.slice(TOPUP_PAYLOAD_PREFIX.length)).get();
  if (!snap.exists) return { ok: false, message: "Заявка на пополнение не найдена. Создай новую на сайте." };
  const t = snap.data() as TopupDoc;
  if (t.status !== "pending") return { ok: false, message: "Этот счёт уже оплачен." };
  if (Date.now() - t.createdAt > TOPUP_TTL_MS) return { ok: false, message: "Счёт устарел. Создай новую заявку на сайте." };
  if (t.amount !== totalAmount) return { ok: false, message: "Сумма счёта не совпадает с заявкой. Создай новую на сайте." };
  return { ok: true };
}

/** Зачисляет оплаченные звёзды на кошелёк. Идемпотентна (повторный update от Telegram ничего не удваивает). */
export async function fulfillStarsTopup(
  topupId: string,
  paidAmount: number,
  payment: { chargeId?: string; payerTgId?: number } = {}
): Promise<string> {
  const db = adminDb();
  const topupRef = db.collection("starsTopups").doc(topupId);
  const out = await db.runTransaction(async (tx) => {
    const snap = await tx.get(topupRef);
    if (!snap.exists) throw new Error("topup-not-found");
    const t = snap.data() as TopupDoc;
    if (t.status === "paid") return { already: true as const, uid: t.uid, amount: t.amount };
    tx.update(topupRef, { status: "paid", paidAt: Date.now(), paidStars: paidAmount, telegramChargeId: payment.chargeId ?? null, payerTgId: payment.payerTgId ?? null });
    tx.set(db.collection("users").doc(t.uid), { starsWallet: FieldValue.increment(paidAmount) }, { merge: true });
    tx.set(db.collection("starsWalletLog").doc(), { uid: t.uid, delta: paidAmount, type: "topup", ref: topupId, at: Date.now() });
    return { already: false as const, uid: t.uid, amount: paidAmount };
  });

  if (out.already) return `Это пополнение уже зачислено — ${out.amount} ⭐ на балансе сайта.`;
  sendWebPush(out.uid, { title: "Баланс ⭐ пополнен", body: `+${out.amount} ⭐ — можно оплачивать товары за Stars`, url: "/profile/stars" }, "purchases");
  return `Готово! На баланс сайта зачислено ${out.amount} ⭐. Теперь на странице товара можно нажать «Оплатить с баланса ⭐».`;
}

export type WalletPayResult = { ok: true; amountStars: number; message: string } | { ok: false; error: string };

/** Покупка товара за ⭐ с кошелька: списание + оформление заказа одним потоком (общая логика с оплатой счёта в боте). */
export async function payWithStarsWallet(uid: string, productId: string, qty: number): Promise<WalletPayResult> {
  const db = adminDb();
  const productSnap = await db.collection("products").doc(productId).get();
  if (!productSnap.exists) return { ok: false, error: "Товар не найден" };
  const product = productSnap.data() as { name: string; stock: number; sellerId: string; starsPrice?: number; paymentMode?: "rub" | "stars" | "both"; banned?: boolean };
  if (product.stock < qty) return { ok: false, error: `В наличии всего ${product.stock} шт.` };
  if (product.banned) return { ok: false, error: "Товар заблокирован модерацией" };
  if (!product.sellerId || product.sellerId === "store") return { ok: false, error: "Оплата Stars доступна только для товаров продавцов" };
  if (product.sellerId === uid) return { ok: false, error: "Нельзя купить свой собственный товар" };
  if (!product.starsPrice || product.starsPrice <= 0) return { ok: false, error: "Продавец не установил цену в Stars для этого товара" };
  if (getPaymentMode(product) === "rub") return { ok: false, error: "Этот товар продаётся только за рубли" };

  const amountStars = product.starsPrice * qty;
  const invoiceRef = db.collection("starsInvoices").doc();
  const userRef = db.collection("users").doc(uid);

  try {
    await db.runTransaction(async (tx) => {
      const userSnap = await tx.get(userRef);
      const wallet = (userSnap.data()?.starsWallet as number | undefined) ?? 0;
      if (wallet < amountStars) throw new Error("not-enough");
      tx.set(invoiceRef, { buyerId: uid, productId, quantity: qty, sellerId: product.sellerId, amountStars, status: "pending", paymentSource: "wallet", createdAt: Date.now() });
      tx.update(userRef, { starsWallet: FieldValue.increment(-amountStars) });
      tx.set(db.collection("starsWalletLog").doc(), { uid, delta: -amountStars, type: "purchase", ref: invoiceRef.id, at: Date.now() });
    });
  } catch (e: any) {
    if (e?.message === "not-enough") return { ok: false, error: "Недостаточно звёзд на балансе — пополни его" };
    throw e;
  }

  // Оформление заказа. Если товар успели раскупить, fulfillStarsInvoice сама вернёт звёзды на кошелёк.
  const message = await fulfillStarsInvoice(invoiceRef.id, amountStars, {});
  const inv = (await invoiceRef.get()).data() as { status?: string } | undefined;
  if (inv?.status !== "paid") return { ok: false, error: message };
  return { ok: true, amountStars, message };
}
