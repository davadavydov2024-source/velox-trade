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
// "expired" тоже можно отменить вручную — чтобы заявка с вышедшим временем не висела в очереди.
const CANCELLABLE_STATUSES = new Set(["awaiting_nickname", "awaiting_transfer", "received_by_bot", "expired"]);

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const idToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const decoded = await adminAuth().verifyIdToken(idToken).catch(() => null);
    if (!decoded) return NextResponse.json({ error: "Сессия истекла" }, { status: 401 });

    const db = adminDb();
    const isAdmin = isAdminUid(decoded.uid);
    let isHelper = false;
    const actorSnap = await db.collection("users").doc(decoded.uid).get();
    if (!isAdmin) {
      isHelper = actorSnap.data()?.staffRole === "helper";
    }
    if (!isAdmin && !isHelper) {
      return NextResponse.json({ error: "Доступ только для администраторов и помощников по выдаче" }, { status: 403 });
    }
    const actorName: string = actorSnap.data()?.displayName ?? "Администратор";

    const { orderId, status, cancelReason, refund } = await req.json();
    if (typeof orderId !== "string" || !orderId) {
      return NextResponse.json({ error: "Не указан заказ" }, { status: 400 });
    }
    if (status !== "received_by_bot" && status !== "delivered" && status !== "cancelled") {
      return NextResponse.json({ error: "Недопустимый статус" }, { status: 400 });
    }
    // Помощник может только продвигать статус выдачи призов колеса — отмена (более
    // "тяжёлое" и окончательное действие) остаётся только у полноценных админов.
    if (isHelper && status === "cancelled") {
      return NextResponse.json({ error: "Отмену выдачи может сделать только администратор" }, { status: 403 });
    }

    const deliveryRef = db.collection("deliveries").doc(orderId);

    const orderRef = db.collection("orders").doc(orderId);
    const chatRef = db.collection("orderChats").doc(orderId);

    const info = await db.runTransaction(async (tx) => {
      const snap = await tx.get(deliveryRef);
      if (!snap.exists) throw new Error("not-found");
      const delivery = snap.data() as {
        status: string;
        source?: string;
        expiresAt: number;
        buyerId: string;
        sellerId: string;
        productName: string;
        botNickname?: string;
      };

      // Помощник видит и трогает только заявки-призы колеса фортуны — та же граница,
      // что и в firestore.rules для чтения (см. match /deliveries).
      if (isHelper && delivery.source !== "wheel") {
        throw new Error("forbidden-scope");
      }

      if (status === "cancelled") {
        if (!CANCELLABLE_STATUSES.has(delivery.status)) {
          throw new Error(`wrong-order:${delivery.status}`);
        }
        const reason = typeof cancelReason === "string" ? cancelReason.trim().slice(0, 300) : "";

        // ВСЕ чтения — до первой записи (требование транзакций Firestore). Раньше здесь был
        // tx.update(orderChats/{orderId}) без проверки: для обмена (source "trade") и для выдачи,
        // у которой покупатель ещё не вписал ник, документа чата нет — update падал с NOT_FOUND,
        // и админ получал 500 "Не удалось обновить статус". Теперь существование чата проверяется.
        const chatSnap = await tx.get(chatRef);
        const wantRefund = refund === true && !isHelper;
        let orderData:
          | { userId: string; total: number; status: string; items: { productId: string; quantity: number }[] }
          | null = null;
        let existingProducts: string[] = [];
        if (wantRefund) {
          const orderSnap = await tx.get(orderRef);
          if (orderSnap.exists) {
            const o = orderSnap.data() as { userId: string; total: number; status: string; items?: { productId: string; quantity: number }[] };
            if (o.status === "pending_confirmation" || o.status === "disputed") {
              orderData = { userId: o.userId, total: o.total, status: o.status, items: o.items ?? [] };
              const prodSnaps = await Promise.all(orderData.items.map((i) => tx.get(db.collection("products").doc(i.productId))));
              existingProducts = orderData.items.filter((_, idx) => prodSnaps[idx].exists).map((i) => i.productId);
            }
          }
        }
        const refunded = !!orderData;

        tx.update(deliveryRef, {
          status: "cancelled",
          cancelledAt: Date.now(),
          cancelledByAdminUid: decoded.uid,
          ...(reason ? { cancelReason: reason } : {}),
          logs: FieldValue.arrayUnion({
            at: Date.now(),
            actor: "admin",
            action: `${actorName} отменил(а) выдачу${reason ? `. Причина: ${reason}` : ""}${refunded ? ". Деньги возвращены покупателю" : ""}`,
          }),
        });

        if (orderData) {
          tx.update(orderRef, { status: "cancelled", cancelledAt: Date.now(), cancelReason: reason || "Выдача отменена администратором" });
          tx.update(db.collection("users").doc(orderData.userId), { balance: FieldValue.increment(orderData.total) });
          for (const item of orderData.items) {
            if (existingProducts.includes(item.productId)) {
              tx.update(db.collection("products").doc(item.productId), { stock: FieldValue.increment(item.quantity) });
            }
          }
        }

        const message = {
          from: "system",
          text: `❌ Выдача отменена администрацией${reason ? `. Причина: ${reason}` : ""}.${refunded ? ` Деньги (${orderData!.total} ₽) возвращены покупателю на баланс.` : ""} Если это ошибка — напишите в поддержку.`,
          createdAt: Date.now(),
        };
        if (chatSnap.exists) {
          tx.update(chatRef, { messages: FieldValue.arrayUnion(message), updatedAt: Date.now() });
        } else if (delivery.source !== "trade") {
          tx.set(chatRef, { orderId, buyerId: delivery.buyerId, sellerId: delivery.sellerId, messages: [message], updatedAt: Date.now() });
        }
        return { buyerId: delivery.buyerId, sellerId: delivery.sellerId, productName: delivery.productName, status: "cancelled" as const, refundedAmount: refunded ? orderData!.total : 0 };
      }

      // Разрешаем идти только по цепочке awaiting_transfer → received_by_bot → delivered —
      // нельзя перепрыгнуть шаг (например, отметить "выдано", ещё не подтвердив получение ботом).
      if (NEXT_STATUS[delivery.status] !== status) {
        throw new Error(`wrong-order:${delivery.status}`);
      }

      const timestampField = status === "received_by_bot" ? "receivedAt" : "deliveredAt";
      const adminField = status === "received_by_bot" ? "receivedByAdminUid" : "deliveredByAdminUid";
      const logAction =
        status === "received_by_bot"
          ? `${actorName} подтвердил(а): бот получил предмет от продавца`
          : `${actorName} подтвердил(а): товар выдан покупателю`;
      tx.update(deliveryRef, {
        status,
        [timestampField]: Date.now(),
        [adminField]: decoded.uid,
        logs: FieldValue.arrayUnion({ at: Date.now(), actor: "admin", action: logAction }),
      });

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

      return { buyerId: delivery.buyerId, sellerId: delivery.sellerId, productName: delivery.productName, status, refundedAmount: 0 };
    });

    // Не блокируем ответ админу — уведомления шлём фоново.
    if (info.status === "cancelled") {
      notifyTelegramServer(
        info.buyerId,
        `❌ Выдача товара «${info.productName}» отменена администрацией.${info.refundedAmount ? ` Деньги (${info.refundedAmount} ₽) возвращены на баланс.` : ""} Подробности — в чате заказа или в поддержке.`
      );
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
    if (err?.message === "forbidden-scope") {
      return NextResponse.json({ error: "Эта заявка не относится к призам колеса — доступно только администратору" }, { status: 403 });
    }
    if (typeof err?.message === "string" && err.message.startsWith("wrong-order:")) {
      return NextResponse.json({ error: `Нельзя изменить статус из текущего состояния «${err.message.split(":")[1]}»` }, { status: 400 });
    }
    console.error("admin/deliveries/update-status error:", err);
    return NextResponse.json({ error: "Не удалось обновить статус" }, { status: 500 });
  }
}
