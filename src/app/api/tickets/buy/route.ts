import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";

export const runtime = "nodejs";

// Сколько рублей с баланса сайта стоит 1 тикет. Курс задаётся переменной окружения
// TICKET_PRICE_RUB, чтобы менять его без правки кода; по умолчанию 1 тикет = 1 ₽.
const TICKET_PRICE_RUB = process.env.TICKET_PRICE_RUB ? Number(process.env.TICKET_PRICE_RUB) : 1;

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const idToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    const decoded = await adminAuth().verifyIdToken(idToken).catch(() => null);
    if (!decoded) return NextResponse.json({ error: "Сессия истекла" }, { status: 401 });

    const { tickets } = await req.json();
    const amount = Math.floor(Number(tickets));
    if (!Number.isFinite(amount) || amount < 1 || amount > 100000) {
      return NextResponse.json({ error: "Укажи количество тикетов от 1 до 100000" }, { status: 400 });
    }
    const cost = +(amount * TICKET_PRICE_RUB).toFixed(2);

    const db = adminDb();
    const userRef = db.collection("users").doc(decoded.uid);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(userRef);
      if (!snap.exists) throw new Error("user-not-found");
      if (snap.data()?.banned === true) throw new Error("banned");
      const balance: number = snap.data()?.balance ?? 0;
      if (balance < cost) throw new Error("insufficient-balance");
      tx.update(userRef, { balance: FieldValue.increment(-cost), ticketBalance: FieldValue.increment(amount) });
    });

    return NextResponse.json({ ok: true, tickets: amount, cost });
  } catch (err: any) {
    const map: Record<string, { message: string; status: number }> = {
      "user-not-found": { message: "Профиль не найден", status: 404 },
      banned: { message: "Аккаунт заблокирован", status: 403 },
      "insufficient-balance": { message: "Недостаточно средств на балансе", status: 400 },
    };
    const known = map[err?.message];
    if (known) return NextResponse.json({ error: known.message }, { status: known.status });
    console.error("tickets/buy error:", err);
    return NextResponse.json({ error: "Не удалось купить тикеты" }, { status: 500 });
  }
}
