import { collection, addDoc, getDocs, query, doc, updateDoc } from "firebase/firestore";
import { db } from "./firebase";
import { SellRequest } from "@/types";
import { createProduct } from "./products";

const sellRequestsCol = collection(db, "sellRequests");

export async function createSellRequest(data: Omit<SellRequest, "id" | "createdAt" | "status">) {
  return addDoc(sellRequestsCol, { ...data, status: "pending", createdAt: Date.now() });
}

export async function getAllSellRequests(): Promise<SellRequest[]> {
  const snap = await getDocs(query(sellRequestsCol));
  const requests = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as SellRequest);
  return requests.sort((a, b) => b.createdAt - a.createdAt);
}

export async function setSellRequestStatus(id: string, status: "approved" | "rejected") {
  return updateDoc(doc(db, "sellRequests", id), { status });
}

/**
 * Одобряет заявку на продажу и сразу создаёт товар в каталоге из её данных —
 * продавцом становится автор заявки (sellerId = r.userId), остаток 1 шт., редкость по умолчанию
 * "common" (в самой заявке редкости нет — админ всегда может поправить её потом в «Товарах»).
 * Раньше одобрение только меняло статус заявки, а товар приходилось добавлять вручную,
 * из-за чего он либо забывался, либо не появлялся вовсе.
 */
export async function approveSellRequest(r: SellRequest) {
  await createProduct({
    gameId: r.gameId,
    sellerId: r.userId,
    name: r.itemName,
    description: r.description,
    image: r.imageUrl,
    price: r.price,
    rarity: "common",
    stock: 1,
  });
  await setSellRequestStatus(r.id, "approved");
}
