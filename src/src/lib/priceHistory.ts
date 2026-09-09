import { collection, addDoc, getDocs, query, where, orderBy, limit } from "firebase/firestore";
import { db } from "./firebase";

export interface PricePoint {
  price: number;
  at: number;
}

export async function logPriceChange(productId: string, price: number) {
  return addDoc(collection(db, "priceHistory"), { productId, price, at: Date.now() });
}

export async function getPriceHistory(productId: string): Promise<PricePoint[]> {
  const snap = await getDocs(
    query(collection(db, "priceHistory"), where("productId", "==", productId), orderBy("at", "asc"), limit(60))
  );
  return snap.docs.map((d) => ({ price: d.data().price, at: d.data().at }));
}
