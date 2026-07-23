import { doc, getDoc, setDoc, updateDoc, arrayUnion, collection, query, where, getDocs } from "firebase/firestore";
import { db } from "./firebase";
import { OrderChat, OrderChatMessage } from "@/types";

function chatRef(orderId: string) {
  return doc(db, "orderChats", orderId);
}

export async function getOrderChat(orderId: string): Promise<OrderChat | null> {
  const snap = await getDoc(chatRef(orderId));
  if (!snap.exists()) return null;
  return snap.data() as OrderChat;
}

/** Все чаты по сделкам, где пользователь — покупатель или продавец, для раздела «Чаты». */
export async function getUserOrderChats(uid: string): Promise<OrderChat[]> {
  const col = collection(db, "orderChats");
  const [asBuyer, asSeller] = await Promise.all([
    getDocs(query(col, where("buyerId", "==", uid))),
    getDocs(query(col, where("sellerId", "==", uid))),
  ]);
  const map = new Map<string, OrderChat>();
  asBuyer.docs.forEach((d) => map.set(d.id, d.data() as OrderChat));
  asSeller.docs.forEach((d) => map.set(d.id, d.data() as OrderChat));
  return Array.from(map.values()).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function sendOrderChatMessage(
  orderId: string,
  buyerId: string,
  sellerId: string,
  from: OrderChatMessage["from"],
  text: string
) {
  const ref = chatRef(orderId);
  const snap = await getDoc(ref);
  const message: OrderChatMessage = { from, text, createdAt: Date.now() };

  if (!snap.exists()) {
    await setDoc(ref, { orderId, buyerId, sellerId, messages: [message], updatedAt: Date.now() });
  } else {
    await updateDoc(ref, { messages: arrayUnion(message), updatedAt: Date.now() });
  }
}
