import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { notifyTelegramServer } from "@/lib/telegramNotifyServer";
import { sendWebPush } from "@/lib/webPushServer";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const idToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const decoded = await adminAuth().verifyIdToken(idToken).catch(() => null);
    if (!decoded) return NextResponse.json({ error: "Сессия истекла" }, { status: 401 });
    const uid = decoded.uid;

    const { code } = await req.json();
    if (typeof code !== "string" || !code.trim()) {
      return NextResponse.json({ error: "Код обязателен" }, { status: 400 });
    }

    const db = adminDb();
    const promoSnap = await db.collection("promoCodes").where("code", "==", code.trim().toUpperCase()).limit(1).get();
    if (promoSnap.empty) return NextResponse.json({ error: "Промокод не найден" }, { status: 404 });
    const promoDoc = promoSnap.docs[0];
    const promo = promoDoc.data() as {
      type: string;
      active: boolean;
      expiresAt: number | null;
      usedBy: string[];
      maxUses: number | null;
      giftType?: "balance" | "product";
      giftBalance?: number;
      giftProductId?: string;
      giftProductName?: string;
    };

    if (promo.type !== "gift") return NextResponse.json({ error: "Это не промо-подарок" }, { status: 400 });
    if (!promo.active) return NextResponse.json({ error: "Промокод неактивен" }, { status: 400 });
    if (promo.expiresAt && Date.now() > promo.expiresAt) return NextResponse.json({ error: "Срок действия промокода истёк" }, { status: 400 });
    if (promo.usedBy.includes(uid)) return NextResponse.json({ error: "Вы уже использовали этот промокод" }, { status: 400 });
    if (promo.maxUses != null && promo.usedBy.length >= promo.maxUses) {
      return NextResponse.json({ error: "Лимит активаций промокода исчерпан" }, { status: 400 });
    }

    const userRef = db.collection("users").doc(uid);
    const productRef = promo.giftType === "product" && promo.giftProductId ? db.collection("products").doc(promo.giftProductId) : null;
    let wonSellerId: string | null = null;
    let wonProductName = "";
    let wonOrderId: string | null = null;

    const result = await db.runTransaction(async (tx) => {
      // Сначала все чтения, потом все записи (иначе Firestore ругается на смешение).
      const freshPromoSnap = await tx.get(promoDoc.ref);
      const productSnap = productRef ? await tx.get(productRef) : null;

      const freshPromo = freshPromoSnap.data() as { usedBy: string[] };
      if (freshPromo.usedBy.includes(uid)) throw new Error("already-used");

      tx.update(promoDoc.ref, { usedBy: FieldValue.arrayUnion(uid) });

      if (promo.giftType === "balance" && promo.giftBalance) {
        tx.update(userRef, { balance: FieldValue.increment(promo.giftBalance) });
        return { giftType: "balance", giftBalance: promo.giftBalance };
      }

      if (promo.giftType === "product" && productRef && promo.giftProductId) {
        if (!productSnap?.exists || (productSnap.data()?.stock ?? 0) <= 0) {
          throw new Error("out-of-stock");
        }
        const product = productSnap.data() as { sellerId: string; name: string };
        tx.update(productRef, { stock: FieldValue.increment(-1) });
        const orderRef = db.collection("orders").doc();
        tx.set(orderRef, {
          userId: uid,
          sellerId: product.sellerId,
          items: [{ productId: promo.giftProductId, name: product.name, price: 0, quantity: 1 }],
          total: 0,
          status: "pending_confirmation",
          createdAt: Date.now(),
        });
        // Тот же путь, что и у обычной покупки: чат с продавцом, "Подтвердить получение",
        // "Пожаловаться" — а не сразу "получено", ведь продавцу ещё нужно фактически выдать подарок.
        tx.set(db.collection("orderChats").doc(orderRef.id), {
          orderId: orderRef.id,
          buyerId: uid,
          sellerId: product.sellerId,
          messages: [{ from: "system", text: "🎁 Промо-подарок активирован! Напиши продавцу, чтобы договориться о получении предмета.", createdAt: Date.now() }],
          updatedAt: Date.now(),
        });
        wonSellerId = product.sellerId;
        wonProductName = promo.giftProductName ?? product.name;
        wonOrderId = orderRef.id;
        return { giftType: "product", giftProductName: wonProductName };
      }

      throw new Error("misconfigured");
    });

    if (wonSellerId && wonSellerId !== "store") {
      notifyTelegramServer(wonSellerId, `🎁 Ваш товар «${wonProductName}» отдан по промо-подарку`);
      sendWebPush(wonSellerId, { title: "Товар отдан по промокоду", body: wonProductName, url: "/profile/sales" });
    }

    return NextResponse.json({ ok: true, ...result, orderId: wonOrderId });
  } catch (err: any) {
    const map: Record<string, string> = {
      "already-used": "Вы уже использовали этот промокод",
      "out-of-stock": "Товар по этому промокоду закончился — обратись к администратору",
      misconfigured: "Этот промокод настроен некорректно — обратись к администратору",
    };
    const message = map[err?.message];
    if (message) return NextResponse.json({ error: message }, { status: 400 });
    console.error("promo/redeem-gift error:", err);
    return NextResponse.json({ error: "Не удалось активировать промокод" }, { status: 500 });
  }
}
