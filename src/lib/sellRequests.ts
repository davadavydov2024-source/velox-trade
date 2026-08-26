import { collection, addDoc, getDocs, query, doc, updateDoc } from "firebase/firestore";
import { db } from "./firebase";
import { stripUndefined } from "./stripUndefined";
import { SellRequest } from "@/types";
import { createProduct } from "./products";
import { notifyTelegram, notifyAdminTelegram } from "./telegramNotify";
import { notifyPush } from "./webPushNotify";

const sellRequestsCol = collection(db, "sellRequests");

export async function createSellRequest(data: Omit<SellRequest, "id" | "createdAt" | "status">) {
  const ref = await addDoc(sellRequestsCol, { ...stripUndefined(data), status: "pending", createdAt: Date.now() });
  notifyAdminTelegram(`🏷️ Новая заявка на продажу: «${data.itemName}» от ${data.userNick} — ${data.price} ₽`);
  return ref;
}

export async function getAllSellRequests(): Promise<SellRequest[]> {
  const snap = await getDocs(query(sellRequestsCol));
  const requests = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as SellRequest);
  return requests.sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Отклоняет заявку — просто меняет статус, товар в каталог не добавляется.
 * Для одобрения используй approveSellRequest — она ещё и создаёт сам товар.
 */
export async function setSellRequestStatus(request: SellRequest, status: "approved" | "rejected") {
  await updateDoc(doc(db, "sellRequests", request.id), { status });
  if (status === "rejected") {
    notifyTelegram(request.userId, `❌ Заявка на продажу «${request.itemName}» отклонена.`);
    notifyPush(request.userId, "Заявка отклонена", `«${request.itemName}» — заявка на продажу отклонена.`, "/profile/sell", "messages");
  }
}

/**
 * Одобряет заявку на продажу И сразу создаёт товар в каталоге на основе её данных —
 * раньше одобрение только меняло статус заявки, а товар приходилось добавлять вручную
 * через «Товары», из-за чего он нигде не появлялся, если админ забывал это сделать.
 * Продавец — сам автор заявки (его uid), начальный остаток — 1 шт (это конкретный сданный предмет).
 * Редкость по умолчанию "common" — админ может поправить её и остальные детали в «Товары» после создания.
 */
/**
 * Одобряет заявку на продажу И сразу создаёт товар в каталоге на основе её данных —
 * количество и редкость берём из того, что выбрал продавец в форме заявки.
 */
export async function approveSellRequest(request: SellRequest): Promise<string> {
  const productRef = await createProduct({
    gameId: request.gameId,
    sellerId: request.userId,
    name: request.itemName,
    description: request.description,
    image: request.imageUrl,
    price: request.price,
    rarity: request.rarity ?? "common",
    stock: request.stock ?? 1,
    deliveryMethod: request.deliveryMethod ?? "seller",
    ...(request.discountPercent ? { discountPercent: request.discountPercent } : {}),
    ...(request.auctionEnabled
      ? {
          auctionEnabled: true,
          auctionStatus: "active" as const,
          auctionStartPrice: request.auctionStartPrice ?? request.price,
          auctionCurrentPrice: request.auctionStartPrice ?? request.price,
          auctionMinStep: request.auctionMinStep ?? 10,
          auctionBidCount: 0,
        }
      : {}),
  });
  await updateDoc(doc(db, "sellRequests", request.id), { status: "approved", productId: productRef.id });
  notifyTelegram(request.userId, `✅ Заявка на продажу «${request.itemName}» одобрена — товар уже в каталоге!`);
  notifyPush(request.userId, "Заявка одобрена", `«${request.itemName}» — товар уже в каталоге.`, `/product/${productRef.id}`, "messages");
  return productRef.id;
}
