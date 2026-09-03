import { collection, addDoc, getDocs, query, orderBy, where, doc, updateDoc, deleteDoc } from "firebase/firestore";
import { db } from "./firebase";
import { WheelPrize } from "@/types";

const prizesCol = collection(db, "wheelPrizes");

export async function getAllWheelPrizes(): Promise<WheelPrize[]> {
  const snap = await getDocs(query(prizesCol, orderBy("createdAt", "desc")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as WheelPrize);
}

/**
 * ID товаров, которые сейчас "заперты" под колесо фортуны (тип приза "product" и ещё остались
 * попытки выигрыша, remaining > 0). Такие товары не должны попадать в обычный каталог/поиск —
 * иначе их можно было бы просто купить напрямую в обход колеса. Фильтруем remaining > 0 на
 * клиенте, а не через Firestore where, чтобы не заводить составной индекс ради одного запроса.
 */
export async function getActiveWheelProductIds(): Promise<Set<string>> {
  const snap = await getDocs(query(prizesCol, where("type", "==", "product")));
  const ids = new Set<string>();
  snap.docs.forEach((d) => {
    const data = d.data() as WheelPrize;
    if ((data.remaining ?? 0) > 0 && data.productId) ids.add(data.productId);
  });
  return ids;
}

export async function createWheelPrize(data: Omit<WheelPrize, "id" | "createdAt">) {
  return addDoc(prizesCol, { ...data, createdAt: Date.now() });
}

export async function updateWheelPrize(id: string, changes: Partial<WheelPrize>) {
  return updateDoc(doc(db, "wheelPrizes", id), changes);
}

export async function deleteWheelPrize(id: string) {
  return deleteDoc(doc(db, "wheelPrizes", id));
}
