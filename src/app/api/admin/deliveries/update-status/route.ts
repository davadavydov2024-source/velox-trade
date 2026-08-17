import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { notifyTelegramServer } from "@/lib/telegramNotifyServer";
import { sendWebPush } from "@/lib/webPushServer";

export const runtime = "nodejs";

function isAdminUid(uid: string): boolean {
  const list = (process.env.NEXT_PUBLIC_ADMIN_UIDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return list.includes(uid);
}

const NEXT_STATUS: Record<string, string> = {
  awaiting_transfer: "received_by_bot", // админ вручную проверил в игре: бот получил предмет от продавца
  received_by_bot: "delivered", // админ вручную выдал предмет покупателю у бота
};

// Отменить можно из любого незавершённого состояния (спор, ошибка, невозможность передачи и
// т.п.) — но не то, что уже реально выдано или уже отменено/просрочено.
const CANCELLABLE_STATUSES = new Set(["awaiting_nickname", "awaiting_transfer", "received_by_bot"]);

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const idToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const decoded = await adminAuth().verifyIdToken(idToken).catch(() => null);
    if (!decoded || !isAdminUid(decoded.uid)) {
      return NextResponse.json({ error: "Доступ только для администраторов" }, { status: 403 });
    }

    const { orderId, status, cancelReason } = await req.json();
    if (typeof orderId !== "string" || !orderId) {
      return NextResponse.json({ error: "Не указан заказ" }, { status: 400 });
    }
    if (status !== "received_by_bot" && status !== "delivered" && status !== "cancelled") {
      return NextResponse.json({ error: "Недопустимый статус" }, { status: 400 });
    }

    const db = adminDb();
    const deliveryRef = db.collection("deliveries").doc(orderId);

    const info = await db.runTransaction(async (tx) => {
      const snap = await tx.get(deliveryRef);
      if (!snap.exists) throw new Error("not-found");
      const delivery = snap.data() as {
        status: string;
        expiresAt: number;
        buyerId: string;
        sellerId: string;
        productName: string;
        botNickname?: string;
      };

      if (status === "cancelled") {
        if (!CANCELLABLE_STATUSES.has(delivery.status)) {
          throw new Error(`wrong-order:${delivery.status}`);
        }
        const reason = typeof cancelReason === "string" ? cancelReason.trim().slice(0, 300) : "";
        tx.update(deliveryRef, {
          status: "cancelled",
          cancelledAt: Date.now(),
          cancelledByAdminUid: decoded.uid,
          ...(reason ? { cancelReason: reason } : {}),
        });
        tx.update(db.collection("orderChats").doc(orderId), {
          messages: FieldValue.arrayUnion({
            from: "system",
            text: `❌ Выдача отменена администрацией${reason ? `. Причина: ${reason}` : ""}. Если это ошибка — напишите в поддержку.`,
            createdAt: Date.now(),
          }),
          updatedAt: Date.now(),
        });
        return { buyerId: delivery.buyerId, sellerId: delivery.sellerId, productName: delivery.productName, status: "cancelled" as const };
      }

      // Разрешаем идти только по цепочке awaiting_transfer → received_by_bot → delivered —
      // нельзя перепрыгнуть шаг (например, отметить "выдано", ещё не подтвердив получение ботом).
      if (NEXT_STATUS[delivery.status] !== status) {
        throw new Error(`wrong-order:${delivery.status}`);
      }

      const timestampField = status === "received_by_bot" ? "receivedAt" : "deliveredAt";
      const adminField = status === "received_by_bot" ? "receivedByAdminUid" : "deliveredByAdminUid";
      tx.update(deliveryRef, { status, [timestampField]: Date.now(), [adminField]: decoded.uid });

      const chatText =
        status === "received_by_bot"
          ? `✅ Бот-посредник (${delivery.botNickname ?? "бот"}) получил предмет от продавца. Покупателю нужно зайти в игру и забрать «${delivery.productName}» у бота.`
          : `📦 Товар «${delivery.productName}» выдан покупателю. Сделка завершена.`;

      // К этому моменту документ orderChats уже точно существует (создаётся при вводе ника,
      // см. api/deliveries/submit-nickname), поэтому здесь можно просто update.
      tx.update(db.collection("orderChats").doc(orderId), {
        messages: FieldValue.arrayUnion({ from: "system", text: chatText, createdAt: Date.now() }),
        updatedAt: Date.now(),
      });

      return { buyerId: delivery.buyerId, sellerId: delivery.sellerId, productName: delivery.productName, status };
    });

    // Не блокируем ответ админу — уведомления шлём фоново.
    if (info.status === "cancelled") {
      notifyTelegramServer(info.buyerId, `❌ Выдача товара «${info.productName}» отменена администрацией. Подробности — в чате заказа или в поддержке.`);
      notifyTelegramServer(info.sellerId, `❌ Выдача товара «${info.productName}» отменена администрацией.`);
      sendWebPush(info.buyerId, { title: "Выдача отменена", body: info.productName, url: "/chats" }, "purchases");
    } else if (info.status === "received_by_bot") {
      notifyTelegramServer(info.buyerId, `✅ Бот получил твой предмет «${info.productName}» — заходи в игру и забирай его у бота-посредника.`);
      sendWebPush(info.buyerId, { title: "Можно забирать товар", body: `«${info.productName}» ждёт тебя у бота-посредника`, url: "/chats" }, "purchases");
    } else {
      notifyTelegramServer(info.buyerId, `📦 Товар «${info.productName}» выдан. Спасибо за покупку!`);
      notifyTelegramServer(info.sellerId, `📦 Товар «${info.productName}» выдан покупателю. Сделка завершена.`);
      sendWebPush(info.buyerId, { title: "Товар выдан", body: info.productName, url: "/chats" }, "purchases");
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    if (err?.message === "not-found") return NextResponse.json({ error: "Заявка не найдена" }, { status: 404 });
    if (typeof err?.message === "string" && err.message.startsWith("wrong-order:")) {
      return NextResponse.json({ error: `Нельзя изменить статус из текущего состояния «${err.message.split(":")[1]}»` }, { status: 400 });
    }
    console.error("admin/deliveries/update-status error:", err);
    return NextResponse.json({ error: "Не удалось обновить статус" }, { status: 500 });
  }
}
