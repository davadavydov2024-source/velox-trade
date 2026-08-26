import { doc, onSnapshot, collection, query, where, orderBy, limit } from "firebase/firestore";
import { db, auth } from "./firebase";
import { getAppCheckHeader } from "./appCheckFetch";
import { Product, AuctionBid } from "@/types";

/** Живая подписка на сам товар — чтобы текущая ставка/лидер обновлялись на экране без перезагрузки. */
export function subscribeAuctionProduct(productId: string, cb: (product: Product | null) => void): () => void {
  return onSnapshot(doc(db, "products", productId), (snap) => {
    cb(snap.exists() ? (snap.data() as Product) : null);
  });
}

/** Последние ставки по товару, самые новые сверху — для истории торгов на странице товара. */
export function subscribeAuctionBids(productId: string, cb: (bids: AuctionBid[]) => void, max = 20): () => void {
  const q = query(collection(db, "auctionBids"), where("productId", "==", productId), orderBy("createdAt", "desc"), limit(max));
  return onSnapshot(q, (snap) => cb(snap.docs.map((d) => d.data() as AuctionBid)));
}

async function authedFetch(url: string, body: unknown) {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error("Нужно войти в аккаунт");
  const idToken = await currentUser.getIdToken();
  const appCheckHeader = await getAppCheckHeader();
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}`, ...appCheckHeader },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Не удалось выполнить действие");
  return data;
}

export async function placeBid(productId: string, amount: number): Promise<void> {
  await authedFetch("/api/auctions/bid", { productId, amount });
}

export async function endAuction(productId: string): Promise<{ hasWinner: boolean }> {
  return authedFetch("/api/auctions/end", { productId });
}

export async function cancelAuction(productId: string): Promise<void> {
  await authedFetch("/api/auctions/cancel", { productId });
}
