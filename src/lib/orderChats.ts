import { doc, getDoc, setDoc, updateDoc, arrayUnion } from "firebase/firestore";
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
