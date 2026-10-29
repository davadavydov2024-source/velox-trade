import { collection, doc, setDoc, deleteDoc, getDocs, query, where } from "firebase/firestore";
import { db } from "./firebase";
import { Product } from "@/types";
import { getPurchasableProductById } from "./products";

function favId(uid: string, productId: string): string {
  return `${uid}_${productId}`;
}

export async function addFavorite(uid: string, productId: string): Promise<void> {
  await setDoc(doc(db, "favorites", favId(uid, productId)), { uid, productId, createdAt: Date.now() });
}

export async function removeFavorite(uid: string, productId: string): Promise<void> {
  await deleteDoc(doc(db, "favorites", favId(uid, productId)));
}

export async function getUserFavoriteIds(uid: string): Promise<string[]> {
  const snap = await getDocs(query(collection(db, "favorites"), where("uid", "==", uid)));
  return snap.docs.map((d) => d.data().productId as string);
}

export async function getUserFavoriteProducts(uid: string): Promise<Product[]> {
  const ids = await getUserFavoriteIds(uid);
  // getPurchasableProductById, а не обычный: если товар с тех пор "заперли" под колесо фортуны,
  // он просто исчезает из избранного — как будто снова недоступен для покупки.
  const products = await Promise.all(ids.map((id) => getPurchasableProductById(id).catch(() => null)));
  return products.filter((p): p is Product => p !== null);
}
