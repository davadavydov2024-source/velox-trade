import { adminDb } from "./firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { editTelegramMessage, editTelegramCaption, InlineButton } from "./telegramBot";
import { notifyTelegramServer } from "./telegramNotifyServer";
import { sendWebPush } from "./webPushServer";

/** Редактирует сообщение админа: у фото-уведомлений меняется подпись, у текстовых — текст. Кнопки убираются. */
async function editAdminMessage(chatId: number, messageId: number, text: string, hasPhoto: boolean, buttons?: InlineButton[][]) {
  if (hasPhoto) await editTelegramCaption(chatId, messageId, text, buttons);
  else await editTelegramMessage(chatId, messageId, text, buttons);
}

type Outcome<T> = { ok: true; data: T } | { ok: false; reason: "missing" | "processed"; status?: string };

// ===================== Заявки на продажу =====================

/** Те же поля, что собирает ИИ-модерация (api/sell-requests/moderate) и ручное одобрение на сайте. */
function buildProductData(r: any, now: number): Record<string, unknown> {
  const data: Record<string, unknown> = {
    gameId: r.gameId,
    sellerId: r.userId,
    name: String(r.itemName).trim(),
    description: r.description ?? "",
    image: r.imageUrl,
    price: r.price,
    rarity: r.rarity ?? "common",
    stock: r.stock ?? 1,
    deliveryMethod: r.deliveryMethod ?? "seller",
    moderation: { by: "admin", at: now, note: "Одобрено админом в Telegram" },
    createdAt: now,
  };
  if (r.category) data.category = r.category;
  if (r.starsPrice && r.paymentMode !== "rub") data.starsPrice = r.starsPrice;
  if (r.paymentMode) data.paymentMode = r.paymentMode;
  if (r.discountPercent && !r.auctionEnabled && r.paymentMode !== "stars") data.discountPercent = r.discountPercent;
  if (r.auctionEnabled && r.paymentMode !== "stars") {
    const start = r.auctionStartPrice ?? r.price;
    Object.assign(data, {
      auctionEnabled: true,
      auctionStatus: "active",
      auctionStartPrice: start,
      auctionCurrentPrice: start,
      auctionMinStep: r.auctionMinStep ?? 10,
      auctionBidCount: 0,
    });
  }
  return data;
}

export async function approveSellRequestServer(requestId: string): Promise<Outcome<{ name: string; productId: string }>> {
  const db = adminDb();
  const reqRef = db.collection("sellRequests").doc(requestId);
  const productRef = db.collection("products").doc();
  // Товар и смена статуса — одной транзакцией: двойной клик или одновременное одобрение на сайте не создадут дубль.
  const res = await db.runTransaction(async (tx) => {
    const snap = await tx.get(reqRef);
    if (!snap.exists) return { kind: "missing" as const };
    const r = snap.data() as any;
    if (r.status !== "pending") return { kind: "processed" as const, status: r.status as string };
    tx.set(productRef, buildProductData(r, Date.now()));
    tx.update(reqRef, { status: "approved", productId: productRef.id, approvedBy: "admin" });
    return { kind: "ok" as const, r };
  });
  if (res.kind === "missing") return { ok: false, reason: "missing" };
  if (res.kind === "processed") return { ok: false, reason: "processed", status: res.status };

  const name = String(res.r.itemName);
  notifyTelegramServer(res.r.userId, `✅ Заявка на продажу «${name}» одобрена — товар уже в каталоге!`);
  sendWebPush(res.r.userId, { title: "Заявка одобрена", body: `«${name}» — товар уже в каталоге.`, url: `/product/${productRef.id}` }, "messages");
  return { ok: true, data: { name, productId: productRef.id } };
}

export async function rejectSellRequestServer(requestId: string): Promise<Outcome<{ name: string }>> {
  const db = adminDb();
  const reqRef = db.collection("sellRequests").doc(requestId);
  const res = await db.runTransaction(async (tx) => {
    const snap = await tx.get(reqRef);
    if (!snap.exists) return { kind: "missing" as const };
    const r = snap.data() as any;
    if (r.status !== "pending") return { kind: "processed" as const, status: r.status as string };
    tx.update(reqRef, { status: "rejected", rejectedBy: "admin" });
    return { kind: "ok" as const, r };
  });
  if (res.kind === "missing") return { ok: false, reason: "missing" };
  if (res.kind === "processed") return { ok: false, reason: "processed", status: res.status };

  const name = String(res.r.itemName);
  notifyTelegramServer(res.r.userId, `❌ Заявка на продажу «${name}» отклонена.`);
  sendWebPush(res.r.userId, { title: "Заявка отклонена", body: `«${name}»`, url: "/profile/sell" }, "messages");
  return { ok: true, data: { name } };
}

export async function approveSellRequestFromBot(chatId: number, messageId: number, requestId: string, hasPhoto = false) {
  const res = await approveSellRequestServer(requestId);
  if (res.ok) return editAdminMessage(chatId, messageId, `✅ Одобрено — «${res.data.name}» уже в каталоге.`, hasPhoto);
  await editAdminMessage(
    chatId,
    messageId,
    res.reason === "missing" ? "Заявка уже не найдена (возможно, удалена)." : `Заявка уже обработана (статус: ${res.status}).`,
    hasPhoto
  );
}

export async function rejectSellRequestFromBot(chatId: number, messageId: number, requestId: string, hasPhoto = false) {
  const res = await rejectSellRequestServer(requestId);
  if (res.ok) return editAdminMessage(chatId, messageId, `❌ Заявка «${res.data.name}» отклонена.`, hasPhoto);
  await editAdminMessage(
    chatId,
    messageId,
    res.reason === "missing" ? "Заявка уже не найдена (возможно, удалена)." : `Заявка уже обработана (статус: ${res.status}).`,
    hasPhoto
  );
}

// ===================== Правки товара =====================

export async function approveProductEditFromBot(chatId: number, messageId: number, editId: string, hasPhoto = false) {
  const db = adminDb();
  const editRef = db.collection("productEditRequests").doc(editId);
  const res = await db.runTransaction(async (tx) => {
    const snap = await tx.get(editRef);
    if (!snap.exists) return { kind: "missing" as const };
    const r = snap.data() as any;
    if (r.status !== "pending") return { kind: "processed" as const, status: r.status as string };
    const productRef = db.collection("products").doc(r.productId);
    if (!(await tx.get(productRef)).exists) return { kind: "no-product" as const };
    tx.update(productRef, {
      name: r.proposedName,
      description: r.proposedDescription,
      price: r.proposedPrice,
      image: r.proposedImage,
      category: r.proposedCategory,
      rarity: r.proposedRarity,
      starsPrice: r.proposedStarsPrice,
      paymentMode: r.proposedStarsPrice ? (r.proposedPaymentMode ?? "both") : "rub",
      editCount: FieldValue.increment(1),
    });
    tx.update(editRef, { status: "approved" });
    return { kind: "ok" as const, r };
  });

  if (res.kind === "ok") {
    notifyTelegramServer(res.r.sellerId, `✅ Правки товара «${res.r.proposedName}» одобрены и применены.`);
    return editAdminMessage(chatId, messageId, `✅ Правки применены — «${res.r.proposedName}».`, hasPhoto);
  }
  const msg =
    res.kind === "processed"
      ? `Заявка уже обработана (статус: ${res.status}).`
      : res.kind === "no-product"
        ? "Товар уже удалён — применять правки некуда."
        : "Заявка уже не найдена.";
  await editAdminMessage(chatId, messageId, msg, hasPhoto);
}

export async function rejectProductEditFromBot(chatId: number, messageId: number, editId: string, hasPhoto = false) {
  const db = adminDb();
  const editRef = db.collection("productEditRequests").doc(editId);
  const res = await db.runTransaction(async (tx) => {
    const snap = await tx.get(editRef);
    if (!snap.exists) return { kind: "missing" as const };
    const r = snap.data() as any;
    if (r.status !== "pending") return { kind: "processed" as const, status: r.status as string };
    tx.update(editRef, { status: "rejected" });
    return { kind: "ok" as const, r };
  });
  if (res.kind === "ok") {
    notifyTelegramServer(res.r.sellerId, `❌ Правки товара «${res.r.productName}» отклонены.`);
    return editAdminMessage(chatId, messageId, `❌ Правки к «${res.r.productName}» отклонены.`, hasPhoto);
  }
  await editAdminMessage(chatId, messageId, res.kind === "processed" ? `Заявка уже обработана (статус: ${res.status}).` : "Заявка уже не найдена.", hasPhoto);
}

// ===================== Бан из уведомления о регистрации =====================
// Бан необратим одним нажатием не является, но случайный тап по кнопке не должен блокировать человека —
// поэтому сначала короткое подтверждение.

export async function askBanFromBot(chatId: number, messageId: number, uid: string, hasPhoto = false) {
  const snap = await adminDb().collection("users").doc(uid).get();
  if (!snap.exists) return editAdminMessage(chatId, messageId, "Пользователь не найден.", hasPhoto);
  const name = (snap.data() as any).displayName ?? uid;
  await editAdminMessage(chatId, messageId, `Забанить ${name} навсегда?`, hasPhoto, [
    [
      { text: "✅ Да, забанить", callback_data: `ban_yes_${uid}` },
      { text: "↩️ Отмена", callback_data: `ban_no_${uid}` },
    ],
  ]);
}

export async function banFromBot(chatId: number, messageId: number, uid: string, hasPhoto = false) {
  const ref = adminDb().collection("users").doc(uid);
  const snap = await ref.get();
  if (!snap.exists) return editAdminMessage(chatId, messageId, "Пользователь не найден.", hasPhoto);
  const name = (snap.data() as any).displayName ?? uid;
  await ref.update({ banned: true, banReason: "Заблокирован администратором", banUntil: "forever" });
  notifyTelegramServer(uid, "🚫 Ваш аккаунт заблокирован.\nПричина: Заблокирован администратором");
  await editAdminMessage(chatId, messageId, `🚫 ${name} забанен. Снять бан можно на сайте: /admin/users.`, hasPhoto);
}

export async function cancelBanFromBot(chatId: number, messageId: number, uid: string, hasPhoto = false) {
  const snap = await adminDb().collection("users").doc(uid).get();
  const name = snap.exists ? ((snap.data() as any).displayName ?? uid) : uid;
  await editAdminMessage(chatId, messageId, `Бан не применён — ${name}.`, hasPhoto);
}
