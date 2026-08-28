import { adminDb } from "./firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { sendTelegramMessage, editTelegramMessage, InlineButton } from "./telegramBot";

interface SellRequest {
  id: string;
  userId: string;
  userNick: string;
  itemName: string;
  gameId: string;
  gameName: string;
  imageUrl: string;
  price: number;
  commissionPercent: number;
  description: string;
  stock?: number;
  rarity?: string;
  status: "pending" | "approved" | "rejected";
}

interface TopUpRequest {
  id: string;
  userId: string;
  userNick: string;
  amount: number;
  type: "deposit" | "withdraw";
  method?: string;
  comment?: string;
  status: "pending" | "approved" | "rejected";
}

// ===================== Главное админ-меню =====================

export function adminMenuButtons(): InlineButton[][] {
  return [
    [{ text: "🏷️ Заявки на продажу", callback_data: "admin_sell_requests" }],
    [{ text: "💰 Заявки на пополнение/вывод", callback_data: "admin_topups" }],
    [{ text: "🎁 Промокоды", callback_data: "admin_promo_menu" }],
    [{ text: "🎉 Конкурсы", callback_data: "admin_contest_menu" }],
  ];
}

export const ADMIN_MENU_TEXT = "🛠 Админ-панель. Выбери раздел:";

// ===================== Заявки на продажу =====================

export async function sendPendingSellRequests(chatId: number) {
  const snap = await adminDb().collection("sellRequests").where("status", "==", "pending").get();
  if (snap.empty) {
    await sendTelegramMessage(chatId, "Новых заявок на продажу нет.");
    return;
  }
  for (const doc of snap.docs) {
    const r = doc.data() as Omit<SellRequest, "id">;
    const commission = Math.round(r.price * ((r.commissionPercent ?? 0) / 100));
    const payout = r.price - commission;
    const text =
      `🏷️ ${r.itemName} — ${r.gameName}\n` +
      `От: ${r.userNick}\n` +
      `Цена: ${r.price} ₽ · Комиссия ${r.commissionPercent ?? 0}%: −${commission} ₽ · К выплате: ${payout} ₽\n` +
      (r.description ? `Описание: ${r.description}` : "");
    await sendTelegramMessage(chatId, text, [
      [
        { text: "✅ Одобрить", callback_data: `sell_approve_${doc.id}` },
        { text: "❌ Отклонить", callback_data: `sell_reject_${doc.id}` },
      ],
    ]);
  }
}

export async function approveSellRequestFromBot(chatId: number, messageId: number, requestId: string) {
  const db = adminDb();
  const ref = db.collection("sellRequests").doc(requestId);
  const snap = await ref.get();
  if (!snap.exists) {
    await editTelegramMessage(chatId, messageId, "Заявка уже не найдена (возможно, обработана на сайте).");
    return;
  }
  const r = snap.data() as Omit<SellRequest, "id">;
  if (r.status !== "pending") {
    await editTelegramMessage(chatId, messageId, `Заявка уже обработана (статус: ${r.status}).`);
    return;
  }

  const productRef = await db.collection("products").add({
    gameId: r.gameId,
    sellerId: r.userId,
    name: r.itemName,
    description: r.description,
    image: r.imageUrl,
    price: r.price,
    rarity: r.rarity ?? "common",
    stock: r.stock ?? 1,
    createdAt: Date.now(),
  });
  await ref.update({ status: "approved", productId: productRef.id });

  await editTelegramMessage(chatId, messageId, `✅ Одобрено — «${r.itemName}» уже в каталоге.`);
}

export async function rejectSellRequestFromBot(chatId: number, messageId: number, requestId: string) {
  await adminDb().collection("sellRequests").doc(requestId).update({ status: "rejected" });
  await editTelegramMessage(chatId, messageId, "❌ Заявка отклонена.");
}

// ===================== Заявки на пополнение/вывод =====================

const METHOD_LABEL: Record<string, string> = {
  qr: "QR-код",
  playerok: "Playerok",
  funpay: "FunPay",
  phone: "По номеру телефона",
};

export async function sendPendingTopUps(chatId: number) {
  const snap = await adminDb().collection("topups").where("status", "==", "pending").get();
  if (snap.empty) {
    await sendTelegramMessage(chatId, "Новых заявок на баланс нет.");
    return;
  }
  for (const doc of snap.docs) {
    const r = doc.data() as Omit<TopUpRequest, "id">;
    const text =
      `💰 ${r.userNick} — ${r.type === "deposit" ? "пополнение" : "вывод"} ${r.amount} ₽\n` +
      (r.method ? `Способ: ${METHOD_LABEL[r.method] ?? r.method}\n` : "") +
      (r.comment ? `Комментарий: ${r.comment}` : "");
    await sendTelegramMessage(chatId, text, [
      [
        { text: "✅ Подтвердить", callback_data: `topup_approve_${doc.id}` },
        { text: "❌ Отклонить", callback_data: `topup_reject_${doc.id}` },
      ],
    ]);
  }
}

export async function approveTopUpFromBot(chatId: number, messageId: number, requestId: string) {
  const db = adminDb();
  const ref = db.collection("topups").doc(requestId);
  const snap = await ref.get();
  if (!snap.exists) {
    await editTelegramMessage(chatId, messageId, "Заявка уже не найдена.");
    return;
  }
  const r = snap.data() as Omit<TopUpRequest, "id">;
  if (r.status !== "pending") {
    await editTelegramMessage(chatId, messageId, `Заявка уже обработана (статус: ${r.status}).`);
    return;
  }

  const delta = r.type === "deposit" ? r.amount : -r.amount;
  await db.collection("users").doc(r.userId).update({ balance: FieldValue.increment(delta) });
  await ref.update({ status: "approved" });

  await editTelegramMessage(
    chatId,
    messageId,
    `✅ Подтверждено — баланс ${r.userNick} изменён на ${delta > 0 ? "+" : ""}${delta} ₽.`
  );
}

export async function rejectTopUpFromBot(chatId: number, messageId: number, requestId: string) {
  await adminDb().collection("topups").doc(requestId).update({ status: "rejected" });
  await editTelegramMessage(chatId, messageId, "❌ Заявка отклонена.");
}

// ===================== Промокоды =====================

export function promoMenuButtons(): InlineButton[][] {
  return [
    [{ text: "➕ Новый промокод", callback_data: "admin_promo_new" }],
    [{ text: "📋 Список активных", callback_data: "admin_promo_list" }],
  ];
}

export const PROMO_CREATE_INSTRUCTIONS =
  "Отправь одним сообщением в формате:\n\n" +
  "СКИДКА КОД ПРОЦЕНТ [MAXUSES] [DAYS]\n" +
  "БАЛАНС КОД СУММА [MAXUSES] [DAYS]\n" +
  "ТОВАР КОД ID_ТОВАРА [MAXUSES] [DAYS]\n\n" +
  "MAXUSES и DAYS — необязательные (сколько раз можно активировать и сколько дней действует). " +
  "Если не указывать — без ограничений.\n\n" +
  "Примеры:\n" +
  "СКИДКА SALE20 20\n" +
  "БАЛАНС WELCOME100 500 100 30\n" +
  "ТОВАР GIFTITEM abc123XYZ";

export async function createPromoCodeFromText(text: string): Promise<string> {
  const parts = text.trim().split(/\s+/);
  if (parts.length < 3) {
    return "Не понял формат. Пример: СКИДКА SALE20 20\n\n" + PROMO_CREATE_INSTRUCTIONS;
  }

  const [kindRaw, codeRaw, valueRaw, maxUsesRaw, daysRaw] = parts;
  const kind = kindRaw.toUpperCase();
  const code = codeRaw.trim().toUpperCase();
  const maxUses = maxUsesRaw && maxUsesRaw !== "-" ? Number(maxUsesRaw) : null;
  const days = daysRaw && daysRaw !== "-" ? Number(daysRaw) : null;
  const expiresAt = days && !Number.isNaN(days) ? Date.now() + days * 24 * 60 * 60 * 1000 : null;

  if (maxUsesRaw && Number.isNaN(maxUses)) return "MAXUSES должен быть числом (или «-» для без ограничений).";
  if (daysRaw && Number.isNaN(days)) return "DAYS должен быть числом (или «-» для без срока).";

  const db = adminDb();

  const existing = await db.collection("promoCodes").where("code", "==", code).get();
  if (!existing.empty) return `Промокод ${code} уже существует.`;

  if (kind === "СКИДКА") {
    const discountPercent = Number(valueRaw);
    if (Number.isNaN(discountPercent) || discountPercent <= 0 || discountPercent > 100) {
      return "Процент скидки должен быть числом от 1 до 100.";
    }
    await db.collection("promoCodes").add({
      code,
      type: "discount",
      discountPercent,
      maxUses,
      usedBy: [],
      active: true,
      expiresAt,
      createdAt: Date.now(),
    });
    return `✅ Промокод-скидка ${code} создан: −${discountPercent}%.`;
  }

  if (kind === "БАЛАНС") {
    const giftBalance = Number(valueRaw);
    if (Number.isNaN(giftBalance) || giftBalance <= 0) {
      return "Сумма пополнения должна быть положительным числом.";
    }
    await db.collection("promoCodes").add({
      code,
      type: "gift",
      giftType: "balance",
      giftBalance,
      maxUses,
      usedBy: [],
      active: true,
      expiresAt,
      createdAt: Date.now(),
    });
    return `✅ Промокод-подарок ${code} создан: +${giftBalance} ₽ на баланс.`;
  }

  if (kind === "ТОВАР") {
    const productId = valueRaw;
    const productSnap = await db.collection("products").doc(productId).get();
    if (!productSnap.exists) return `Товар с id ${productId} не найден. Проверь ID в «Товары» на сайте.`;
    const product = productSnap.data() as { name: string; image: string };
    await db.collection("promoCodes").add({
      code,
      type: "gift",
      giftType: "product",
      giftProductId: productId,
      giftProductName: product.name,
      giftProductImage: product.image,
      maxUses,
      usedBy: [],
      active: true,
      expiresAt,
      createdAt: Date.now(),
    });
    return `✅ Промокод-подарок ${code} создан: товар «${product.name}».`;
  }

  return "Не понял тип. Используй СКИДКА, БАЛАНС или ТОВАР.\n\n" + PROMO_CREATE_INSTRUCTIONS;
}

export async function sendActivePromoCodes(chatId: number) {
  const snap = await adminDb().collection("promoCodes").where("active", "==", true).get();
  if (snap.empty) {
    await sendTelegramMessage(chatId, "Активных промокодов нет.");
    return;
  }
  for (const doc of snap.docs) {
    const p = doc.data() as any;
    const uses = p.maxUses != null ? `${p.usedBy?.length ?? 0}/${p.maxUses}` : `${p.usedBy?.length ?? 0}/∞`;
    const expiry = p.expiresAt ? new Date(p.expiresAt).toLocaleDateString("ru-RU") : "без срока";
    let detail: string;
    if (p.type === "discount") {
      detail = `Скидка −${p.discountPercent}%`;
    } else if (p.giftType === "balance") {
      detail = `Подарок: +${p.giftBalance} ₽`;
    } else {
      detail = `Подарок: товар «${p.giftProductName}»`;
    }
    await sendTelegramMessage(
      chatId,
      `🎁 ${p.code}\n${detail}\nАктиваций: ${uses} · Истекает: ${expiry}`,
      [[{ text: "🗑 Деактивировать", callback_data: `promo_deactivate_${doc.id}` }]]
    );
  }
}

export async function deactivatePromoCodeFromBot(chatId: number, messageId: number, promoId: string) {
  await adminDb().collection("promoCodes").doc(promoId).update({ active: false });
  await editTelegramMessage(chatId, messageId, "🗑 Промокод деактивирован.");
}
