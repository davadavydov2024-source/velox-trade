import { collection, addDoc, getDocs, query, doc, updateDoc, deleteDoc, where } from "firebase/firestore";
import { db } from "./firebase";
import { stripUndefined } from "./stripUndefined";
import { SellRequest } from "@/types";
import { createProduct } from "./products";
import { notifyTelegram, notifyEmail } from "./telegramNotify";
import { auth } from "./firebase";
import { notifyPush } from "./webPushNotify";

const sellRequestsCol = collection(db, "sellRequests");

export async function createSellRequest(data: Omit<SellRequest, "id" | "createdAt" | "status">) {
  // Админу в Telegram больше не пишем отсюда на каждую заявку: теперь большинство проходит ИИ-модерацию
  // само, а о тех, что требуют ручной проверки, админа уведомляет сервер (api/sell-requests/moderate).
  const ref = await addDoc(sellRequestsCol, { ...stripUndefined(data), status: "pending", createdAt: Date.now() });
  return ref;
}

export interface AiModerationOutcome {
  status: "approved" | "rejected" | "pending";
  verdict: "approve" | "reject" | "review" | null;
  reason?: string;
  productId?: string;
}

/**
 * Просит сервер проверить только что созданную заявку ИИ-модерацией. Одобрено — товар уже в каталоге,
 * отклонено — есть причина для продавца, иначе заявка ждёт админа. null — сервер недоступен
 * (заявка при этом создана и останется в очереди у админа).
 */
export async function requestAiModeration(requestId: string): Promise<AiModerationOutcome | null> {
  try {
    const idToken = await auth.currentUser?.getIdToken();
    if (!idToken) return null;
    const res = await fetch("/api/sell-requests/moderate", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ requestId }),
    });
    if (!res.ok) return null;
    return (await res.json()) as AiModerationOutcome;
  } catch {
    return null;
  }
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
    ...(request.category ? { category: request.category } : {}),
    ...(request.starsPrice ? { starsPrice: request.starsPrice } : {}),
    ...(request.paymentMode ? { paymentMode: request.paymentMode } : {}),
    ...(request.discountPercent && !request.auctionEnabled ? { discountPercent: request.discountPercent } : {}),
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
  notifyEmail(
    request.userId,
    `Товар «${request.itemName}» опубликован!`,
    `<div style="font-family:sans-serif;font-size:15px;color:#111;line-height:1.6;">
      <p>Твоя заявка на продажу «${request.itemName}» одобрена — товар уже в каталоге и доступен для покупки.</p>
      <p style="color:#666;font-size:13px;">Посмотреть можно на сайте, в разделе «Мои товары».</p>
    </div>`
  );
  return productRef.id;
}
