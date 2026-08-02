import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";

export const runtime = "nodejs";

const COOLDOWN_MS = 24 * 60 * 60 * 1000;

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
    const promo = promoDoc.data() as { type: string; active: boolean; expiresAt: number | null };
    if (promo.type !== "wheel") return NextResponse.json({ error: "Это не промокод для колеса" }, { status: 400 });
    if (!promo.active) return NextResponse.json({ error: "Этот промокод сейчас неактивен" }, { status: 400 });
    if (promo.expiresAt && Date.now() > promo.expiresAt) return NextResponse.json({ error: "Срок действия промокода истёк" }, { status: 400 });

    const userRef = db.collection("users").doc(uid);
    const userSnap = await userRef.get();
    if (!userSnap.exists) return NextResponse.json({ error: "Профиль не найден" }, { status: 404 });
    const lastSpin: number = userSnap.data()?.lastWheelSpinAt ?? 0;
    if (Date.now() - lastSpin < COOLDOWN_MS) {
      const hoursLeft = Math.ceil((COOLDOWN_MS - (Date.now() - lastSpin)) / (60 * 60 * 1000));
      return NextResponse.json({ error: `Колесо уже крутили сегодня. Попробуй через ${hoursLeft} ч.` }, { status: 400 });
    }

    const prizesSnap = await db.collection("wheelPrizes").where("remaining", ">", 0).get();
    if (prizesSnap.empty) return NextResponse.json({ error: "Призы закончились — загляни позже" }, { status: 400 });

    const prizes = prizesSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as {
      id: string;
      type: "product" | "balance" | "nothing";
      name: string;
      image?: string;
      productId?: string;
      balanceRub?: number;
      weight: number;
      remaining: number;
    }[];

    const totalWeight = prizes.reduce((sum, p) => sum + Math.max(0, p.weight), 0);
    if (totalWeight <= 0) return NextResponse.json({ error: "Колесо сейчас не настроено" }, { status: 400 });

    let roll = Math.random() * totalWeight;
    let chosen = prizes[prizes.length - 1];
    for (const p of prizes) {
      roll -= Math.max(0, p.weight);
      if (roll <= 0) {
        chosen = p;
        break;
      }
    }

    const prizeRef = db.collection("wheelPrizes").doc(chosen.id);

    const result = await db.runTransaction(async (tx) => {
      const freshPrizeSnap = await tx.get(prizeRef);
      const freshUserSnap = await tx.get(userRef);
      if (!freshPrizeSnap.exists || (freshPrizeSnap.data()?.remaining ?? 0) <= 0) {
        throw new Error("prize-depleted");
      }
      const freshLastSpin: number = freshUserSnap.data()?.lastWheelSpinAt ?? 0;
      if (Date.now() - freshLastSpin < COOLDOWN_MS) {
        throw new Error("cooldown");
      }

      tx.update(prizeRef, { remaining: FieldValue.increment(-1) });
      tx.update(userRef, { lastWheelSpinAt: Date.now() });
      tx.update(promoDoc.ref, { usedBy: FieldValue.arrayUnion(uid) });

      if (chosen.type === "balance" && chosen.balanceRub) {
        tx.update(userRef, { balance: FieldValue.increment(chosen.balanceRub) });
      }

      if (chosen.type === "product" && chosen.productId) {
        const productRef = db.collection("products").doc(chosen.productId);
        const productSnap = await tx.get(productRef);
        if (productSnap.exists && (productSnap.data()?.stock ?? 0) > 0) {
          const product = productSnap.data() as { sellerId: string; name: string; price: number };
          tx.update(productRef, { stock: FieldValue.increment(-1) });
          const orderRef = db.collection("orders").doc();
          tx.set(orderRef, {
            userId: uid,
            sellerId: product.sellerId,
            items: [{ productId: chosen.productId, name: product.name, price: 0, quantity: 1 }],
            total: 0,
            status: "confirmed",
            createdAt: Date.now(),
            confirmedAt: Date.now(),
          });
        }
      }

      return { type: chosen.type, name: chosen.name, image: chosen.image, balanceRub: chosen.balanceRub };
    });

    return NextResponse.json({ ok: true, prize: result });
  } catch (err: any) {
    if (err?.message === "prize-depleted") {
      return NextResponse.json({ error: "Этот приз только что закончился — попробуй ещё раз" }, { status: 409 });
    }
    if (err?.message === "cooldown") {
      return NextResponse.json({ error: "Колесо уже крутили сегодня, приходи завтра" }, { status: 400 });
    }
    console.error("wheel/spin error:", err);
    return NextResponse.json({ error: "Не удалось прокрутить колесо" }, { status: 500 });
  }
}
