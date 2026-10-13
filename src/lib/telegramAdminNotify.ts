import { adminDb } from "./firebaseAdmin";
import { sendTelegramMessage, sendTelegramPhoto, InlineButton } from "./telegramBot";

const ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID ? Number(process.env.TELEGRAM_ADMIN_CHAT_ID) : null;
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://velox-trade-zeta.vercel.app").replace(/\/+$/, "");

/** Ряд с одной кнопкой «открыть на сайте». Telegram принимает в url-кнопках только https —
 * на http://localhost ряд просто не добавляется (иначе вся отправка упала бы). */
export function siteRow(path: string, label = "🌐 Открыть на сайте"): InlineButton[] {
  return /^https:\/\//i.test(SITE_URL) ? [{ text: label, url: `${SITE_URL}${path}` }] : [];
}

/** Страницы админки, на которые разрешено вешать кнопку из клиентских вызовов /api/notify/admin. */
export const ALLOWED_ADMIN_PATHS = ["/admin/support", "/admin/disputes", "/admin/deliveries", "/admin/users", "/admin/topups", "/admin/sell-requests"];

/**
 * Одно уведомление на одно событие, даже если запрос пришёл дважды (повтор с клиента, ретрай,
 * fallback после ошибки). create() в Firestore атомарно падает, если документ уже есть.
 */
export async function claimNotice(key: string): Promise<boolean> {
  try {
    await adminDb().collection("adminNotices").doc(key).create({ at: Date.now() });
    return true;
  } catch (err: any) {
    if (err?.code === 6 || /already exists/i.test(String(err?.message))) return false;
    console.error("claimNotice error:", err);
    return true;
  }
}

/** Шлёт админу сообщение (с фото, если оно есть и Telegram его принял) и кнопками. */
export async function sendAdminNotice(o: { text: string; photoUrl?: string; buttons?: InlineButton[][]; chatId?: number }): Promise<boolean> {
  const chatId = o.chatId ?? ADMIN_CHAT_ID;
  if (!chatId) return false;
  const rows = (o.buttons ?? []).filter((r) => r.length > 0);
  const buttons = rows.length ? rows : undefined;
  if (o.photoUrl && /^https:\/\//i.test(o.photoUrl)) {
    // Подпись к фото в Telegram — максимум 1024 символа.
    const ok = await sendTelegramPhoto(chatId, o.photoUrl, o.text.slice(0, 1000), buttons);
    if (ok) return true;
    // Фото не приняли (битая ссылка, слишком большой файл) — шлём текстом, чтобы заявка не потерялась.
  }
  return (await sendTelegramMessage(chatId, o.text, buttons)) !== null;
}

// ===================== Заявки на продажу =====================

export function sellRequestButtons(id: string): InlineButton[][] {
  return [
    [
      { text: "✅ Одобрить", callback_data: `sell_approve_${id}` },
      { text: "❌ Отклонить", callback_data: `sell_reject_${id}` },
    ],
    siteRow("/admin/sell-requests", "🌐 Открыть на сайте"),
  ];
}

export function sellRequestText(r: any, note?: string): string {
  const price =
    r.paymentMode === "stars" ? `${r.starsPrice} ⭐` : r.paymentMode === "both" ? `${r.price} ₽ / ${r.starsPrice} ⭐` : `${r.price} ₽`;
  const lines = [
    "🏷️ Новая заявка на продажу",
    `«${r.itemName}» — ${r.gameName}${r.category ? ` · ${r.category}` : ""}`,
    `От: ${r.userNick}`,
    `Цена: ${price}${r.discountPercent ? ` (скидка ${r.discountPercent}%)` : ""} · Остаток: ${r.stock ?? 1} шт · Редкость: ${r.rarity ?? "common"}`,
  ];
  if (r.paymentMode !== "stars") {
    const commission = Math.round(r.price * ((r.commissionPercent ?? 0) / 100));
    lines.push(`Комиссия ${r.commissionPercent ?? 0}%: −${commission} ₽ · К выплате: ${r.price - commission} ₽`);
  }
  if (r.auctionEnabled) lines.push(`Аукцион: старт ${r.auctionStartPrice ?? r.price} ₽`);
  lines.push(`Выдача: ${r.deliveryMethod === "bot" ? "через бота-посредника" : "напрямую от продавца"}`);
  if (r.description) lines.push(`Описание: ${String(r.description).slice(0, 300)}`);
  if (note) lines.push(`🤖 ${note}`);
  return lines.join("\n");
}

export async function notifyAdminSellRequest(requestId: string, note?: string): Promise<void> {
  try {
    const snap = await adminDb().collection("sellRequests").doc(requestId).get();
    if (!snap.exists) return;
    const r = snap.data() as any;
    if (r.status !== "pending") return;
    if (!(await claimNotice(`sell_${requestId}`))) return;
    await sendAdminNotice({ text: sellRequestText(r, note), photoUrl: r.imageUrl, buttons: sellRequestButtons(requestId) });
  } catch (err) {
    console.error("notifyAdminSellRequest error:", err);
  }
}

// ===================== Пополнение / вывод =====================

const METHOD_LABEL: Record<string, string> = { qr: "QR-код", playerok: "Playerok", funpay: "FunPay", phone: "По номеру телефона" };

export async function notifyAdminTopUp(id: string): Promise<void> {
  try {
    const snap = await adminDb().collection("topups").doc(id).get();
    if (!snap.exists) return;
    const r = snap.data() as any;
    if (r.status !== "pending") return;
    if (!(await claimNotice(`topup_${id}`))) return;
    const text =
      `💰 Новая заявка на ${r.type === "deposit" ? "пополнение" : "вывод"}\n${r.userNick} — ${r.amount} ₽\n` +
      (r.method ? `Способ: ${METHOD_LABEL[r.method] ?? r.method}\n` : "") +
      (r.comment ? `Комментарий: ${String(r.comment).slice(0, 300)}` : "");
    await sendAdminNotice({
      text: text.trim(),
      buttons: [
        [
          { text: "✅ Подтвердить", callback_data: `topup_approve_${id}` },
          { text: "❌ Отклонить", callback_data: `topup_reject_${id}` },
        ],
        siteRow("/admin/topups"),
      ],
    });
  } catch (err) {
    console.error("notifyAdminTopUp error:", err);
  }
}

// ===================== Правки товара =====================

export async function notifyAdminProductEdit(id: string): Promise<void> {
  try {
    const db = adminDb();
    const snap = await db.collection("productEditRequests").doc(id).get();
    if (!snap.exists) return;
    const r = snap.data() as any;
    if (r.status !== "pending") return;
    if (!(await claimNotice(`pedit_${id}`))) return;
    const productSnap = await db.collection("products").doc(r.productId).get();
    const old = productSnap.exists ? (productSnap.data() as any) : null;
    const lines = [`✏️ Заявка на редактирование товара «${r.productName}»`];
    lines.push(old && old.price !== r.proposedPrice ? `Цена: ${old.price} ₽ → ${r.proposedPrice} ₽` : `Цена: ${r.proposedPrice} ₽`);
    if (r.proposedStarsPrice) lines.push(`Stars: ${r.proposedStarsPrice} ⭐`);
    if (r.proposedCategory) lines.push(`Категория: ${r.proposedCategory}`);
    if (old && old.description !== r.proposedDescription) lines.push(`Новое описание: ${String(r.proposedDescription).slice(0, 300)}`);
    await sendAdminNotice({
      text: lines.join("\n"),
      photoUrl: r.proposedImage,
      buttons: [
        [
          { text: "✅ Принять правки", callback_data: `pedit_approve_${id}` },
          { text: "❌ Отклонить", callback_data: `pedit_reject_${id}` },
        ],
        siteRow("/admin/product-edits"),
      ],
    });
  } catch (err) {
    console.error("notifyAdminProductEdit error:", err);
  }
}

// ===================== Новая регистрация =====================

export async function notifyAdminRegistration(uid: string): Promise<void> {
  try {
    const snap = await adminDb().collection("users").doc(uid).get();
    if (!snap.exists) return;
    const u = snap.data() as any;
    if (!(await claimNotice(`reg_${uid}`))) return;
    const text = `🆕 Новый пользователь\nНик: ${u.displayName}\nEmail: ${u.email}${u.age !== undefined ? `\nВозраст: ${u.age}` : ""}`;
    await sendAdminNotice({
      text,
      buttons: [[{ text: "🚫 Забанить", callback_data: `ban_ask_${uid}` }], siteRow("/admin/registrations", "👥 Регистрации на сайте")],
    });
  } catch (err) {
    console.error("notifyAdminRegistration error:", err);
  }
}
