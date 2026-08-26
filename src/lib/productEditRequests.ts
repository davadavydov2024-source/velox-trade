import { collection, addDoc, getDocs, query, doc, getDoc, updateDoc, increment } from "firebase/firestore";
import { db } from "./firebase";
import { stripUndefined } from "./stripUndefined";
import { ProductEditRequest } from "@/types";
import { notifyTelegram, notifyAdminTelegram } from "./telegramNotify";
import { notifyPush } from "./webPushNotify";

export const MAX_PRODUCT_EDITS = 3;

const editRequestsCol = collection(db, "productEditRequests");

export async function createProductEditRequest(data: Omit<ProductEditRequest, "id" | "createdAt" | "status">) {
  const ref = await addDoc(editRequestsCol, { ...stripUndefined(data), status: "pending", createdAt: Date.now() });
  notifyAdminTelegram(`✏️ Заявка на редактирование товара «${data.productName}» от продавца`);
  return ref;
}

export async function getAllProductEditRequests(): Promise<ProductEditRequest[]> {
  const snap = await getDocs(query(editRequestsCol));
  const requests = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ProductEditRequest);
  return requests.sort((a, b) => b.createdAt - a.createdAt);
}

export async function approveProductEditRequest(request: ProductEditRequest) {
  await updateDoc(doc(db, "products", request.productId), {
    name: request.proposedName,
    description: request.proposedDescription,
    price: request.proposedPrice,
    image: request.proposedImage,
    editCount: increment(1),
  });
  await updateDoc(doc(db, "productEditRequests", request.id), { status: "approved" });
  notifyTelegram(request.sellerId, `✅ Правки товара «${request.proposedName}» одобрены и применены.`);
  notifyPush(request.sellerId, "Правки одобрены", `«${request.proposedName}» — изменения применены.`, `/product/${request.productId}`, "messages");
}

export async function rejectProductEditRequest(request: ProductEditRequest) {
  await updateDoc(doc(db, "productEditRequests", request.id), { status: "rejected" });
  notifyTelegram(request.sellerId, `❌ Правки товара «${request.productName}» отклонены.`);
  notifyPush(request.sellerId, "Правки отклонены", `«${request.productName}» — изменения не приняты.`, `/product/${request.productId}`, "messages");
}

/** Сколько раз товар уже редактировался (для проверки лимита на клиенте перед подачей новой заявки). */
export async function getProductEditCount(productId: string): Promise<number> {
  const snap = await getDoc(doc(db, "products", productId));
  return snap.data()?.editCount ?? 0;
}
