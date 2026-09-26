import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";

export const runtime = "nodejs";

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
      const caseData = caseSnap.data() as { name: string; price: number; active: boolean; items: { id: string; name: string; image: string; value: number; weight: number }[] };
      if (!caseData.active) throw new Error("case-inactive");
      if (!caseData.items?.length) throw new Error("case-empty");

      if (!userSnap.exists) throw new Error("user-not-found");
      const balance: number = userSnap.data()?.balance ?? 0;
      if (balance < caseData.price) throw new Error("insufficient-balance");

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

      // Списываем цену открытия и сразу зачисляем стоимость выигранного предмета — реализовано
      // как одно суммарное изменение баланса, чтобы не было промежуточного состояния "деньги
      // списаны, а приз ещё не начислен" при сбое между двумя отдельными update.
      const netChange = chosen.value - caseData.price;
      tx.update(userRef, { balance: FieldValue.increment(netChange) });

      const openingRef = db.collection("caseOpenings").doc();
      tx.set(openingRef, {
        caseId,
        caseName: caseData.name,
        userId: uid,
        wonItemId: chosen.id,
        wonItemName: chosen.name,
        wonItemImage: chosen.image,
        wonValue: chosen.value,
        pricePaid: caseData.price,
        createdAt: Date.now(),
      });

      return { item: chosen, pricePaid: caseData.price, newBalance: balance + netChange };
    });

    return NextResponse.json({ ok: true, item: result.item, pricePaid: result.pricePaid, newBalance: result.newBalance });
  } catch (err: any) {
    const map: Record<string, { message: string; status: number }> = {
      "case-not-found": { message: "Кейс не найден", status: 404 },
      "case-inactive": { message: "Этот кейс сейчас недоступен", status: 400 },
      "case-empty": { message: "В этом кейсе пока нет предметов", status: 400 },
      "user-not-found": { message: "Профиль не найден", status: 404 },
      "insufficient-balance": { message: "Недостаточно средств на балансе", status: 400 },
      "case-misconfigured": { message: "Кейс сейчас неправильно настроен — сообщи администратору", status: 400 },
    };
    const known = map[err?.message];
    if (known) return NextResponse.json({ error: known.message }, { status: known.status });
    console.error("cases/open error:", err);
    return NextResponse.json({ error: "Не удалось открыть кейс" }, { status: 500 });
  }
}
