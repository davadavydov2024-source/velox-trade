import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { moderateListing, ModerationResult } from "@/lib/aiModeration";
import { notifyTelegramServer, notifyAdminTelegramServer } from "@/lib/telegramNotifyServer";
import { sendWebPush } from "@/lib/webPushServer";
import { DEFAULT_FEATURE_FLAGS } from "@/types";

export const runtime = "nodejs";
export const maxDuration = 45;

const RARITIES = ["common", "uncommon", "rare", "epic", "legendary"];
const DELIVERY = ["seller", "bot"];
const PAYMENT_MODES = ["rub", "stars", "both"];
/** Не больше стольких ИИ-проверок от одного человека за час — защита от траты денег на спам заявками. */
const MAX_AI_CHECKS_PER_HOUR = 15;

type Req = {
  userId: string;
  userNick: string;
  itemName: string;
  gameId: string;
  gameName: string;
  category?: string;
  imageUrl: string;
  price: number;
  starsPrice?: number;
  paymentMode?: string;
  discountPercent?: number;
  description: string;
  stock: number;
  rarity: string;
  deliveryMethod: string;
  auctionEnabled?: boolean;
  auctionStartPrice?: number;
  auctionMinStep?: number;
  status: string;
  aiVerdict?: string;
  aiLockedAt?: number;
  createdAt: number;
};

/**
 * Заявку создаёт сам клиент (addDoc), а теперь решение ИИ публикует товар БЕЗ человека — поэтому
 * все числа и поля проверяем заново на сервере: подделанная в консоли заявка (цена -5, остаток 10 000,
 * скидка 100%) не должна попасть в каталог автоматически. Любое несоответствие → ручная проверка админом.
 */
function validateFields(r: Req, minPrice: number): string | null {
  const isNum = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
  if (typeof r.itemName !== "string" || r.itemName.trim().length < 2 || r.itemName.length > 120) return "некорректное название";
  if (typeof r.description !== "string" || r.description.length > 2000) return "некорректное описание";
  if (typeof r.imageUrl !== "string" || !/^https:\/\//i.test(r.imageUrl)) return "некорректная ссылка на изображение";
  if (!isNum(r.price) || r.price < minPrice || r.price > 1_000_000) return "цена вне допустимых границ";
  if (!Number.isInteger(r.stock) || r.stock < 1 || r.stock > 100_000) return "некорректное количество";
  if (!RARITIES.includes(r.rarity)) return "неизвестная редкость";
  if (!DELIVERY.includes(r.deliveryMethod)) return "неизвестный способ выдачи";
  if (r.paymentMode && !PAYMENT_MODES.includes(r.paymentMode)) return "неизвестный способ оплаты";
  if (r.paymentMode && r.paymentMode !== "rub") {
    if (!Number.isInteger(r.starsPrice) || (r.starsPrice as number) < 15 || (r.starsPrice as number) > 1_000_000) return "некорректная цена в Stars";
  }
  if (r.discountPercent !== undefined && (!isNum(r.discountPercent) || r.discountPercent < 0 || r.discountPercent > 90)) return "некорректная скидка";
  if (r.auctionEnabled) {
    if (!isNum(r.auctionStartPrice) || r.auctionStartPrice < minPrice) return "некорректная стартовая цена аукциона";
    if (r.auctionMinStep !== undefined && (!isNum(r.auctionMinStep) || r.auctionMinStep < 1)) return "некорректный шаг аукциона";
  }
  return null;
}

export async function POST(req: NextRequest) {
  let fallbackNote: string | null = null;
  try {
    const authHeader = req.headers.get("authorization");
    const idToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    const decoded = await adminAuth().verifyIdToken(idToken).catch(() => null);
    if (!decoded) return NextResponse.json({ error: "Сессия истекла" }, { status: 401 });
    const uid = decoded.uid;

    const { requestId } = (await req.json().catch(() => ({}))) as { requestId?: string };
    if (typeof requestId !== "string" || !requestId) return NextResponse.json({ error: "Не указана заявка" }, { status: 400 });

    const db = adminDb();
    const reqRef = db.collection("sellRequests").doc(requestId);

    // 1) Занимаем заявку: проверяем владельца и статус и ставим метку в одной транзакции — два
    //    одновременных вызова не создадут два товара.
    const claimed = await db.runTransaction(async (tx) => {
      const snap = await tx.get(reqRef);
      if (!snap.exists) return { kind: "missing" as const };
      const r = snap.data() as Req;
      if (r.userId !== uid) return { kind: "forbidden" as const };
      if (r.status !== "pending" || r.aiVerdict || r.aiLockedAt) return { kind: "already" as const, status: r.status, verdict: r.aiVerdict };
      tx.update(reqRef, { aiLockedAt: Date.now() });
      return { kind: "ok" as const, r };
    });
    if (claimed.kind === "missing") return NextResponse.json({ error: "Заявка не найдена" }, { status: 404 });
    if (claimed.kind === "forbidden") return NextResponse.json({ error: "Это не твоя заявка" }, { status: 403 });
    if (claimed.kind === "already") return NextResponse.json({ status: claimed.status, verdict: claimed.verdict ?? null });
    const r = claimed.r;
    // Если дальше что-то пойдёт не так или ИИ выключен — заявка остаётся админу, и он должен об этом узнать.
    const pendingNote = `🏷️ Новая заявка на продажу: «${r.itemName}» от ${r.userNick} — ${r.price} ₽`;
    fallbackNote = pendingNote;

    const finish = async (status: "pending" | "approved" | "rejected", result: ModerationResult, extra: Record<string, unknown> = {}) => {
      await reqRef.update({ status, aiVerdict: result.verdict, aiReason: result.reason, ...extra });
    };

    // 2) Автомодерация выключена в настройках — всё как раньше: заявку смотрит админ. (Если включена, но ключа ИИ нет,
    //    всё равно работают бесплатные локальные правила, а остальное уходит админу — см. lib/aiModeration.ts.)
    const flagsSnap = await db.collection("settings").doc("features").get();
    const flags = { ...DEFAULT_FEATURE_FLAGS, ...(flagsSnap.exists ? flagsSnap.data() : {}) };
    if (!flags.aiModerationEnabled) {
      await reqRef.update({ aiLockedAt: null });
      notifyAdminTelegramServer(pendingNote);
      return NextResponse.json({ status: "pending", verdict: null, reason: "Заявку проверит администратор" });
    }

    // 3) Ограничение частоты (запрос только по userId — без составного индекса, фильтр в памяти).
    const mine = await db.collection("sellRequests").where("userId", "==", uid).get();
    const hourAgo = Date.now() - 3600_000;
    const recentChecks = mine.docs.filter((d) => (d.data().aiLockedAt ?? 0) > hourAgo).length;
    if (recentChecks > MAX_AI_CHECKS_PER_HOUR) {
      const result: ModerationResult = { verdict: "review", reason: "Слишком много заявок за час — проверит администратор" };
      await finish("pending", result);
      notifyAdminTelegramServer(`🏷️ Заявка «${r.itemName}» от ${r.userNick} ждёт ручной проверки: ${result.reason}`);
      return NextResponse.json({ status: "pending", verdict: "review", reason: result.reason });
    }

    // 4) Проверка полей и существования игры — несоответствие уходит на ручную проверку, не в публикацию.
    const fieldError = validateFields(r, flags.minProductPriceRub);
    const gameSnap = await db.collection("games").where("slug", "==", r.gameId).limit(1).get();
    if (fieldError || gameSnap.empty) {
      const result: ModerationResult = { verdict: "review", reason: fieldError ? `Данные заявки: ${fieldError}` : "Игра не найдена" };
      await finish("pending", result);
      notifyAdminTelegramServer(`🏷️ Заявка «${r.itemName}» от ${r.userNick} требует ручной проверки: ${result.reason}`);
      return NextResponse.json({ status: "pending", verdict: "review", reason: "Заявку проверит администратор" });
    }

    // 5) Сам ИИ.
    const result = await moderateListing({
      name: r.itemName,
      description: r.description ?? "",
      gameName: r.gameName,
      category: r.category,
      price: r.price,
      starsPrice: r.starsPrice,
      stock: r.stock,
      imageUrl: r.imageUrl,
    });

    if (result.verdict === "reject") {
      await finish("rejected", result, { rejectReason: result.reason });
      notifyTelegramServer(uid, `❌ Заявка «${r.itemName}» отклонена автоматической модерацией: ${result.reason}`);
      sendWebPush(uid, { title: "Заявка отклонена", body: `«${r.itemName}»: ${result.reason}`, url: "/profile/sell" }, "messages");
      return NextResponse.json({ status: "rejected", verdict: "reject", reason: result.reason });
    }

    if (result.verdict === "review") {
      await finish("pending", result);
      notifyAdminTelegramServer(`🏷️ Заявка «${r.itemName}» от ${r.userNick} ждёт ручной проверки: ${result.reason}`);
      return NextResponse.json({ status: "pending", verdict: "review", reason: "Заявку проверит администратор" });
    }

    // 6) approve — публикуем товар так же, как при ручном одобрении (см. lib/sellRequests.ts → approveSellRequest).
    const now = Date.now();
    const productData: Record<string, unknown> = {
      gameId: r.gameId,
      sellerId: r.userId,
      name: r.itemName.trim(),
      description: r.description ?? "",
      image: r.imageUrl,
      price: r.price,
      rarity: r.rarity,
      stock: r.stock,
      deliveryMethod: r.deliveryMethod,
      moderation: { by: "ai", at: now, note: result.reason },
      createdAt: now,
    };
    if (r.category) productData.category = r.category;
    if (r.starsPrice && r.paymentMode !== "rub") productData.starsPrice = r.starsPrice;
    if (r.paymentMode) productData.paymentMode = r.paymentMode;
    if (r.discountPercent && !r.auctionEnabled && r.paymentMode !== "stars") productData.discountPercent = r.discountPercent;
    if (r.auctionEnabled && r.paymentMode !== "stars") {
      const start = r.auctionStartPrice ?? r.price;
      Object.assign(productData, {
        auctionEnabled: true,
        auctionStatus: "active",
        auctionStartPrice: start,
        auctionCurrentPrice: start,
        auctionMinStep: r.auctionMinStep ?? 10,
        auctionBidCount: 0,
      });
    }
    const productRef = await db.collection("products").add(productData);
    await finish("approved", result, { productId: productRef.id });

    notifyTelegramServer(uid, `✅ Товар «${r.itemName}» прошёл автоматическую модерацию и уже в каталоге!`);
    sendWebPush(uid, { title: "Товар опубликован", body: `«${r.itemName}» уже в каталоге`, url: `/product/${productRef.id}` }, "messages");
    return NextResponse.json({ status: "approved", verdict: "approve", productId: productRef.id });
  } catch (err) {
    console.error("sell-requests/moderate error:", err);
    // Заявка осталась pending — админ увидит её в очереди как обычно.
    if (fallbackNote) notifyAdminTelegramServer(fallbackNote);
    return NextResponse.json({ status: "pending", verdict: null, reason: "Заявку проверит администратор" });
  }
}
