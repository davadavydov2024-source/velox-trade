import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";

export const runtime = "nodejs";

// Небольшой антиспам-кулдаун — не защита от читерства (тикеты и так защищены транзакцией),
// а просто щит от скриптованного заваливания сервера запросами быстрее, чем реально успевает
// отыграть анимация рулетки на клиенте (~4с).
const COOLDOWN_MS = 1500;
// Тот же часовой лимит на выдачу, что и у призов Колеса Фортуны (см. api/wheel/spin) —
// одинаковое правило для любого "выигранного, а не купленного" товара.
const DELIVERY_TIMEOUT_MS = 60 * 60 * 1000;

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const idToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const decoded = await adminAuth().verifyIdToken(idToken).catch(() => null);
    if (!decoded) return NextResponse.json({ error: "Сессия истекла" }, { status: 401 });
    const uid = decoded.uid;

    const { caseId } = await req.json();
    if (typeof caseId !== "string" || !caseId) {
      return NextResponse.json({ error: "Не указан кейс" }, { status: 400 });
    }

    const db = adminDb();
    const caseRef = db.collection("cases").doc(caseId);
    const userRef = db.collection("users").doc(uid);

    const result = await db.runTransaction(async (tx) => {
      // Firestore требует все чтения до любых записей внутри транзакции.
      const caseSnap = await tx.get(caseRef);
      const userSnap = await tx.get(userRef);

      if (!caseSnap.exists) throw new Error("case-not-found");
      const caseData = caseSnap.data() as {
        name: string;
        priceTickets: number;
        active: boolean;
        items: { id: string; productId: string; name: string; image: string; weight: number }[];
      };
      if (!caseData.active) throw new Error("case-inactive");
      if (!caseData.items?.length) throw new Error("case-empty");

      if (!userSnap.exists) throw new Error("user-not-found");
      const ticketBalance: number = userSnap.data()?.ticketBalance ?? 0;
      if (ticketBalance < caseData.priceTickets) throw new Error("insufficient-tickets");

      const lastOpenAt: number = userSnap.data()?.lastCaseOpenAt ?? 0;
      if (Date.now() - lastOpenAt < COOLDOWN_MS) throw new Error("cooldown");

      const totalWeight = caseData.items.reduce((s, it) => s + Math.max(0, it.weight), 0);
      if (totalWeight <= 0) throw new Error("case-misconfigured");

      let roll = Math.random() * totalWeight;
      let chosen = caseData.items[caseData.items.length - 1];
      for (const it of caseData.items) {
        roll -= Math.max(0, it.weight);
        if (roll <= 0) {
          chosen = it;
          break;
        }
      }

      // Приз — настоящий товар из каталога: читаем его здесь же (до записей, как требует
      // транзакция) и проверяем, что он всё ещё существует и есть в наличии.
      const productRef = db.collection("products").doc(chosen.productId);
      const productSnap = await tx.get(productRef);
      if (!productSnap.exists) throw new Error("prize-product-missing");
      const product = productSnap.data() as { sellerId: string; name: string; gameId: string; image?: string; stock: number };
      if ((product.stock ?? 0) <= 0) throw new Error("prize-out-of-stock");

      tx.update(userRef, { ticketBalance: FieldValue.increment(-caseData.priceTickets), lastCaseOpenAt: Date.now() });
      tx.update(productRef, { stock: FieldValue.increment(-1) });

      const orderRef = db.collection("orders").doc();
      tx.set(orderRef, {
        userId: uid,
        sellerId: product.sellerId,
        items: [{ productId: chosen.productId, name: product.name, price: 0, quantity: 1 }],
        total: 0,
        status: "pending_confirmation",
        createdAt: Date.now(),
      });
      // Тот же путь, что и у обычной покупки/приза колеса: чат с продавцом, подтверждение
      // получения, спор — продавцу всё ещё нужно фактически выдать предмет.
      tx.set(db.collection("orderChats").doc(orderRef.id), {
        orderId: orderRef.id,
        buyerId: uid,
        sellerId: product.sellerId,
        messages: [{ from: "system", text: "📦 Приз выигран в кейсе! Напиши продавцу, чтобы договориться о получении предмета.", createdAt: Date.now() }],
        updatedAt: Date.now(),
      });
      const deliveryCreatedAt = Date.now();
      tx.set(db.collection("deliveries").doc(orderRef.id), {
        orderId: orderRef.id,
        source: "case",
        buyerId: uid,
        sellerId: product.sellerId,
        productId: chosen.productId,
        productName: product.name,
        gameId: product.gameId,
        status: "awaiting_nickname",
        createdAt: deliveryCreatedAt,
        expiresAt: deliveryCreatedAt + DELIVERY_TIMEOUT_MS,
      });

      const openingRef = db.collection("caseOpenings").doc();
      tx.set(openingRef, {
        caseId,
        caseName: caseData.name,
        userId: uid,
        wonItemId: chosen.id,
        wonItemName: product.name,
        wonItemImage: product.image ?? chosen.image,
        wonOrderId: orderRef.id,
        pricePaidTickets: caseData.priceTickets,
        createdAt: Date.now(),
      });

      return {
        item: { id: chosen.id, name: product.name, image: product.image ?? chosen.image },
        priceTickets: caseData.priceTickets,
        newTicketBalance: ticketBalance - caseData.priceTickets,
        orderId: orderRef.id,
      };
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err: any) {
    const map: Record<string, { message: string; status: number }> = {
      "case-not-found": { message: "Кейс не найден", status: 404 },
      "case-inactive": { message: "Этот кейс сейчас недоступен", status: 400 },
      "case-empty": { message: "В этом кейсе пока нет предметов", status: 400 },
      "user-not-found": { message: "Профиль не найден", status: 404 },
      "insufficient-tickets": { message: "Недостаточно тикетов", status: 400 },
      "cooldown": { message: "Слишком часто — подожди секунду и попробуй снова", status: 429 },
      "case-misconfigured": { message: "Кейс сейчас неправильно настроен — сообщи администратору", status: 400 },
      "prize-product-missing": { message: "Приз этого кейса больше недоступен — сообщи администратору", status: 400 },
      "prize-out-of-stock": { message: "Этот приз сейчас закончился на складе — попробуй позже", status: 400 },
    };
    const known = map[err?.message];
    if (known) return NextResponse.json({ error: known.message }, { status: known.status });
    console.error("cases/open error:", err);
    return NextResponse.json({ error: "Не удалось открыть кейс" }, { status: 500 });
  }
}
