import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const idToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const decoded = await adminAuth().verifyIdToken(idToken).catch(() => null);
    if (!decoded) return NextResponse.json({ error: "Сессия истекла" }, { status: 401 });
    const uid = decoded.uid;

    const { orderId, nickname } = await req.json();
    if (typeof orderId !== "string" || !orderId) {
      return NextResponse.json({ error: "Не указан заказ" }, { status: 400 });
    }
    const trimmedNickname = typeof nickname === "string" ? nickname.trim() : "";
    if (!trimmedNickname || trimmedNickname.length > 40) {
      return NextResponse.json({ error: "Укажи свой игровой ник (до 40 символов)" }, { status: 400 });
    }

    const db = adminDb();
    const deliveryRef = db.collection("deliveries").doc(orderId);

    const result = await db.runTransaction(async (tx) => {
      const deliverySnap = await tx.get(deliveryRef);
      if (!deliverySnap.exists) throw new Error("not-found");

      const delivery = deliverySnap.data() as { buyerId: string; status: string; gameId: string; expiresAt: number };
      if (delivery.buyerId !== uid) throw new Error("forbidden");
      if (Date.now() > delivery.expiresAt) throw new Error("expired");
      if (delivery.status !== "awaiting_nickname") throw new Error("already-submitted");

      // Ищем свободного активного бота-посредника для этой игры. Читаем ДО записи — это тоже
      // часть транзакции, чтобы два одновременных вызова не назначили разным покупателям одного
      // и того же бота в состоянии гонки (тут это не критично, т.к. бот может обслуживать многих
      // одновременно, но так чище).
      const botsSnap = await tx.get(
        db.collection("botAccounts").where("gameId", "==", delivery.gameId).where("active", "==", true).limit(1)
      );

      if (botsSnap.empty) throw new Error("no-bot");
      const bot = botsSnap.docs[0].data() as { nickname: string; profileLink?: string };

      tx.update(deliveryRef, {
        buyerNickname: trimmedNickname,
        buyerNicknameSubmittedAt: Date.now(),
        botAccountId: botsSnap.docs[0].id,
        botNickname: bot.nickname,
        botProfileLink: bot.profileLink ?? null,
        status: "awaiting_transfer",
      });

      return { botNickname: bot.nickname };
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err: any) {
    if (err?.message === "not-found") return NextResponse.json({ error: "Заявка на выдачу не найдена" }, { status: 404 });
    if (err?.message === "forbidden") return NextResponse.json({ error: "Это не твой заказ" }, { status: 403 });
    if (err?.message === "expired") return NextResponse.json({ error: "Время на получение истекло" }, { status: 400 });
    if (err?.message === "already-submitted") return NextResponse.json({ error: "Ник уже был указан" }, { status: 400 });
    if (err?.message === "no-bot") {
      return NextResponse.json(
        { error: "Для этой игры пока не подключён бот-посредник — напиши в поддержку, тебе поможет администратор." },
        { status: 409 }
      );
    }
    console.error("deliveries/submit-nickname error:", err);
    return NextResponse.json({ error: "Не удалось сохранить ник" }, { status: 500 });
  }
}
