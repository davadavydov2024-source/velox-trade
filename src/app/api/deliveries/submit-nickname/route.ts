import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { sendWebPush } from "@/lib/webPushServer";

export const runtime = "nodejs";

function getAdminUids(): string[] {
  return (process.env.NEXT_PUBLIC_ADMIN_UIDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}

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

      const delivery = deliverySnap.data() as { buyerId: string; status: string; gameId: string; expiresAt?: number; sellerId: string; productName: string };
      if (delivery.buyerId !== uid) throw new Error("forbidden");
      if (delivery.expiresAt && Date.now() > delivery.expiresAt) throw new Error("expired");
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

      // Системное сообщение в чат заказа — и продавец, и покупатель сразу видят, что происходит,
      // не заходя в отдельный раздел выдачи. tx.set + merge (а не tx.update!) — у обычных покупок
      // (не выигрышей колеса) документ orderChats создаётся лениво при первом реальном сообщении,
      // и на этот момент его может ещё не существовать; update() на несуществующий документ уронил
      // бы всю транзакцию. orderId/buyerId/sellerId дублируем на случай, если создаём документ впервые.
      tx.set(
        db.collection("orderChats").doc(orderId),
        {
          orderId,
          buyerId: delivery.buyerId,
          sellerId: delivery.sellerId,
          messages: FieldValue.arrayUnion({
            from: "system",
            text: `📦 Покупатель указал игровой ник: ${trimmedNickname}. Продавцу нужно передать предмет боту-посреднику: ${bot.nickname}.`,
            createdAt: Date.now(),
          }),
          updatedAt: Date.now(),
        },
        { merge: true }
      );

      return { botNickname: bot.nickname, gameId: delivery.gameId, sellerId: delivery.sellerId, productName: delivery.productName };
    });

    // Не критично для основного результата — фоново, не блокируя ответ покупателю.
    getAdminUids().forEach((adminUid) =>
      sendWebPush(adminUid, { title: "Заявка готова к передаче", body: `${result.productName} — ник: ${trimmedNickname}`, url: "/admin/deliveries" }, "purchases")
    );

    return NextResponse.json({ ok: true, botNickname: result.botNickname });
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
