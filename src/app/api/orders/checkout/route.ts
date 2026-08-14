import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { notifyTelegramServer } from "@/lib/telegramNotifyServer";
import { sendWebPush } from "@/lib/webPushServer";

export const runtime = "nodejs";

// Держим в двух местах (тут и в src/lib/deliveries.ts) намеренно: тот файл — клиентский модуль
// (тянет клиентский Firebase SDK), импортировать его в серверный роут небезопасно.
const DELIVERY_TIMEOUT_MS = 60 * 60 * 1000; // 1 час на весь процесс выдачи через бота-посредника

interface CartLineIn {
  productId: string;
  quantity: number;
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const idToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const decoded = await adminAuth().verifyIdToken(idToken).catch(() => null);
    if (!decoded) return NextResponse.json({ error: "Сессия истекла" }, { status: 401 });
    const uid = decoded.uid;

    const { lines, promoCode } = (await req.json()) as { lines: CartLineIn[]; promoCode?: string };
    if (!Array.isArray(lines) || lines.length === 0) {
      return NextResponse.json({ error: "Корзина пуста" }, { status: 400 });
    }

    const db = adminDb();

    const userRef = db.collection("users").doc(uid);
    const userSnap = await userRef.get();
    if (!userSnap.exists) return NextResponse.json({ error: "Профиль не найден" }, { status: 404 });
    if (userSnap.data()?.banned) return NextResponse.json({ error: "Аккаунт заблокирован" }, { status: 403 });

    // Цену и наличие всегда берём из базы, а не от клиента — иначе можно было бы подделать сумму заказа.
    const productSnaps = await Promise.all(lines.map((l) => db.collection("products").doc(l.productId).get()));
    for (let i = 0; i < lines.length; i++) {
      const snap = productSnaps[i];
      if (!snap.exists) return NextResponse.json({ error: "Один из товаров больше не существует" }, { status: 400 });
      const stock = snap.data()?.stock ?? 0;
      if (stock < lines[i].quantity) {
        return NextResponse.json({ error: `«${snap.data()?.name}» — в наличии всего ${stock} шт.` }, { status: 400 });
      }
    }

    const products = productSnaps.map((s) => ({ id: s.id, ...s.data() })) as {
      id: string;
      name: string;
      price: number;
      sellerId: string;
      gameId: string;
      discountPercent?: number;
    }[];

    const subtotal = products.reduce((sum, p, i) => {
      const unitPrice = p.discountPercent ? p.price * (1 - p.discountPercent / 100) : p.price;
      return sum + unitPrice * lines[i].quantity;
    }, 0);

    let discountPercent = 0;
    let promoRef: FirebaseFirestore.DocumentReference | null = null;
    if (promoCode?.trim()) {
      const promoSnap = await db.collection("promoCodes").where("code", "==", promoCode.trim().toUpperCase()).limit(1).get();
      if (!promoSnap.empty) {
        const doc = promoSnap.docs[0];
        const promo = doc.data() as { type: string; active: boolean; expiresAt: number | null; usedBy: string[]; maxUses: number | null; discountPercent?: number };
        const usable =
          promo.type === "discount" &&
          promo.active &&
          (!promo.expiresAt || Date.now() <= promo.expiresAt) &&
          !promo.usedBy.includes(uid) &&
          (promo.maxUses == null || promo.usedBy.length < promo.maxUses);
        if (usable) {
          discountPercent = promo.discountPercent ?? 0;
          promoRef = doc.ref;
        }
      }
    }

    const finalTotal = +(subtotal * (1 - discountPercent / 100)).toFixed(2);
    const balance = userSnap.data()?.balance ?? 0;
    if (balance < finalTotal) {
      return NextResponse.json({ error: "Недостаточно средств на балансе" }, { status: 400 });
    }

    // Товары могут принадлежать разным продавцам — отдельный заказ на каждого, чтобы чат/подтверждение
    // были привязаны к конкретной сделке (как и раньше на клиенте).
    const bySeller = new Map<string, { productId: string; name: string; price: number; quantity: number }[]>();
    const gameIdBySeller = new Map<string, string>(); // для карточки выдачи — берём игру первого товара в группе
    products.forEach((p, i) => {
      const unitPrice = +(p.discountPercent ? p.price * (1 - p.discountPercent / 100) : p.price).toFixed(2);
      const sellerId = p.sellerId || "store";
      const group = bySeller.get(sellerId) ?? [];
      group.push({ productId: p.id, name: p.name, price: unitPrice, quantity: lines[i].quantity });
      bySeller.set(sellerId, group);
      if (!gameIdBySeller.has(sellerId)) gameIdBySeller.set(sellerId, p.gameId);
    });
    const discountRatio = subtotal > 0 ? finalTotal / subtotal : 1;

    const orderIds = await db.runTransaction(async (tx) => {
      // Все чтения — до всех записей.
      const freshUserSnap = await tx.get(userRef);
      const freshProductSnaps = await Promise.all(products.map((p) => tx.get(db.collection("products").doc(p.id))));

      for (let i = 0; i < freshProductSnaps.length; i++) {
        const stock = freshProductSnaps[i].data()?.stock ?? 0;
        if (stock < lines[i].quantity) throw new Error(`insufficient-stock:${products[i].name}`);
      }
      const freshBalance = freshUserSnap.data()?.balance ?? 0;
      if (freshBalance < finalTotal) throw new Error("insufficient-balance");

      const ids: string[] = [];
      tx.update(userRef, { balance: FieldValue.increment(-finalTotal) });
      products.forEach((p, i) => {
        tx.update(db.collection("products").doc(p.id), { stock: FieldValue.increment(-lines[i].quantity) });
      });
      if (promoRef) {
        tx.update(promoRef, { usedBy: FieldValue.arrayUnion(uid) });
      }
      for (const [sellerId, items] of bySeller) {
        const groupSubtotal = items.reduce((s, it) => s + it.price * it.quantity, 0);
        const orderRef = db.collection("orders").doc();
        tx.set(orderRef, {
          userId: uid,
          sellerId,
          items,
          total: +(groupSubtotal * discountRatio).toFixed(2),
          status: "pending_confirmation",
          createdAt: Date.now(),
        });
        ids.push(orderRef.id);

        // Заявка на выдачу через бота-посредника (см. /admin/bot-accounts и /admin/deliveries).
        // Один Delivery на весь заказ — сколько бы товаров одного продавца в нём ни было.
        const deliveryCreatedAt = Date.now();
        tx.set(db.collection("deliveries").doc(orderRef.id), {
          orderId: orderRef.id,
          buyerId: uid,
          sellerId,
          productId: items[0].productId,
          productName: items.map((it) => it.name).join(", "),
          gameId: gameIdBySeller.get(sellerId) ?? "",
          status: "awaiting_nickname",
          createdAt: deliveryCreatedAt,
          expiresAt: deliveryCreatedAt + DELIVERY_TIMEOUT_MS,
        });
      }
      return ids;
    });

    // Уведомляем каждого продавца о покупке — прямо с сервера, долетит в Telegram
    // независимо от того, закрыл ли покупатель вкладку сразу после оплаты.
    for (const [sellerId, items] of bySeller) {
      if (sellerId === "store") continue; // товары самого магазина — уведомлять некого
      const list = items.map((it) => `«${it.name}» × ${it.quantity}`).join(", ");
      notifyTelegramServer(sellerId, `🛒 У вас купили: ${list}`);
      sendWebPush(sellerId, { title: "У вас купили товар", body: list, url: "/profile/sales" }, "purchases");
    }

    // Публичный счётчик сделок для главной страницы — пишем только через Admin SDK,
    // с клиента запись запрещена правилами Firestore.
    db.collection("stats")
      .doc("public")
      .set({ dealsCount: FieldValue.increment(orderIds.length) }, { merge: true })
      .catch((err) => console.error("stats increment error:", err));

    return NextResponse.json({ ok: true, orderIds });
  } catch (err: any) {
    if (typeof err?.message === "string" && err.message.startsWith("insufficient-stock:")) {
      return NextResponse.json({ error: `Товара «${err.message.split(":")[1]}» уже не хватает на складе` }, { status: 409 });
    }
    if (err?.message === "insufficient-balance") {
      return NextResponse.json({ error: "Недостаточно средств на балансе" }, { status: 400 });
    }
    console.error("orders/checkout error:", err);
    return NextResponse.json({ error: "Не удалось оформить заказ" }, { status: 500 });
  }
}
