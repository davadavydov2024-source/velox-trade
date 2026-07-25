import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { DEFAULT_FEATURE_FLAGS } from "@/types";

export const runtime = "nodejs";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Покупка продвижения товара продавцом за свой баланс. Идёт через сервер (а не напрямую из
 * браузера в Firestore), потому что:
 * 1) запись в коллекцию products по правилам доступна только админу — обычный продавец не может
 *    редактировать товар сам, даже свой собственный;
 * 2) цену и срок берём из актуальных настроек на сервере, а не от клиента — иначе можно было бы
 *    подменить сумму списания в запросе.
 * Баланс списывается и товар обновляется одной транзакцией, так что деньги не могут "потеряться"
 * при сбое на middle шаге.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const idToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const auth = adminAuth();
    let uid: string;
    try {
      uid = (await auth.verifyIdToken(idToken)).uid;
    } catch {
      return NextResponse.json({ error: "Сессия истекла. Войди заново." }, { status: 401 });
    }

    const { productId, tier } = await req.json();
    if (typeof productId !== "string" || (tier !== "game" && tier !== "home")) {
      return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
    }

    const db = adminDb();

    const userRef = db.collection("users").doc(uid);
    const productRef = db.collection("products").doc(productId);
    const flagsRef = db.collection("settings").doc("features");

    const [userSnap, productSnap, flagsSnap] = await Promise.all([userRef.get(), productRef.get(), flagsRef.get()]);

    if (!userSnap.exists) {
      return NextResponse.json({ error: "Профиль не найден" }, { status: 404 });
    }
    const userData = userSnap.data() as { balance: number; banned?: boolean };
    if (userData.banned) {
      return NextResponse.json({ error: "Аккаунт заблокирован" }, { status: 403 });
    }

    if (!productSnap.exists) {
      return NextResponse.json({ error: "Товар не найден" }, { status: 404 });
    }
    const productData = productSnap.data() as { sellerId: string; boostTier?: string; boostUntil?: number };
    if (productData.sellerId !== uid) {
      return NextResponse.json({ error: "Это не твой товар" }, { status: 403 });
    }

    const flags = flagsSnap.exists ? { ...DEFAULT_FEATURE_FLAGS, ...flagsSnap.data() } : DEFAULT_FEATURE_FLAGS;
    const price = tier === "game" ? flags.boostGamePriceRub : flags.boostHomePriceRub;
    const days = tier === "game" ? flags.boostGameDays : flags.boostHomeDays;

    if (userData.balance < price) {
      return NextResponse.json({ error: "Недостаточно средств на балансе" }, { status: 400 });
    }

    // Если продвижение уже активно — продлеваем от текущей даты окончания, а не от "сейчас"
    // (иначе повторная покупка впритык к истечению срока могла бы "украсть" пару дней).
    const now = Date.now();
    const currentlyActive = (productData.boostUntil ?? 0) > now;
    const base = currentlyActive ? productData.boostUntil! : now;
    const boostUntil = base + days * DAY_MS;
    // "home" — старший тир, включает в себя всё, что даёт "game". Если у товара уже был "home",
    // покупка "game" не должна его понижать.
    const boostTier = tier === "home" || productData.boostTier === "home" ? "home" : "game";

    await db.runTransaction(async (tx) => {
      const freshUserSnap = await tx.get(userRef);
      const fresh = freshUserSnap.data() as { balance: number };
      if (fresh.balance < price) {
        throw new Error("insufficient-balance");
      }
      tx.update(userRef, { balance: FieldValue.increment(-price) });
      tx.update(productRef, { boostTier, boostUntil });
    });

    return NextResponse.json({ ok: true, boostTier, boostUntil });
  } catch (err: any) {
    if (err?.message === "insufficient-balance") {
      return NextResponse.json({ error: "Недостаточно средств на балансе" }, { status: 400 });
    }
    console.error("products/boost error:", err);
    return NextResponse.json({ error: "Не удалось оформить продвижение. Попробуй позже." }, { status: 500 });
  }
}
