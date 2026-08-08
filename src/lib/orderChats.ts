import { doc, getDoc, setDoc, updateDoc, arrayUnion, collection, query, where, getDocs, onSnapshot, QuerySnapshot, DocumentData } from "firebase/firestore";
import { db } from "./firebase";
import { OrderChat, OrderChatMessage } from "@/types";
import { notifyTelegram } from "./telegramNotify";

function chatRef(orderId: string) {
  return doc(db, "orderChats", orderId);
}

export async function getOrderChat(orderId: string): Promise<OrderChat | null> {
  const snap = await getDoc(chatRef(orderId));
  if (!snap.exists()) return null;
  return snap.data() as OrderChat;
}

/** Живая подписка на один чат по заказу — сообщения появляются сами, без перезагрузки страницы. */
export function subscribeOrderChat(orderId: string, cb: (chat: OrderChat | null) => void) {
  return onSnapshot(chatRef(orderId), (snap) => cb(snap.exists() ? (snap.data() as OrderChat) : null), () => cb(null));
}

/** Живая подписка на все чаты пользователя (как покупателя и как продавца) — для бейджей
 * "новое сообщение" и всплывающих уведомлений на сайте, пока человек на сайте. */
export function subscribeUserOrderChats(uid: string, cb: (chats: OrderChat[]) => void) {
  const col = collection(db, "orderChats");
  const state = new Map<string, OrderChat>();
  const emit = () => cb(Array.from(state.values()).sort((a, b) => b.updatedAt - a.updatedAt));

  const applySnapshot = (snap: QuerySnapshot<DocumentData>) => {
    snap.docChanges().forEach((change) => {
      if (change.type === "removed") state.delete(change.doc.id);
      else state.set(change.doc.id, change.doc.data() as OrderChat);
    });
    emit();
  };

  const unsub1 = onSnapshot(query(col, where("buyerId", "==", uid)), applySnapshot);
  const unsub2 = onSnapshot(query(col, where("sellerId", "==", uid)), applySnapshot);
  return () => {
    unsub1();
    unsub2();
  };
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

  // Уведомляем в Telegram того, кому адресовано сообщение (если у него привязан бот) —
  // только для настоящих реплик участников, автоматические системные записи (подтверждение
  // получения, открытие спора и т.п.) уведомлений не шлют, чтобы не спамить.
  const preview = text.length > 200 ? `${text.slice(0, 200)}…` : text;
  if (from === "buyer") {
    notifyTelegram(sellerId, `💬 Новое сообщение по заказу от покупателя:\n${preview}`);
  } else if (from === "seller") {
    notifyTelegram(buyerId, `💬 Новое сообщение по заказу от продавца:\n${preview}`);
  } else if (from === "admin") {
    notifyTelegram(buyerId, `💬 Администратор написал в чате по заказу:\n${preview}`);
    notifyTelegram(sellerId, `💬 Администратор написал в чате по заказу:\n${preview}`);
  }
}
