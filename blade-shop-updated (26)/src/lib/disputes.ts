import { collection, doc, getDoc, getDocs, setDoc, updateDoc, query, orderBy } from "firebase/firestore";
import { db } from "./firebase";
import { Dispute } from "@/types";
import { notifyTelegram } from "./telegramNotify";
import { sendOrderChatMessage } from "./orderChats";

const disputesCol = collection(db, "disputes");

export async function createDispute(data: Omit<Dispute, "id" | "status" | "createdAt">) {
  const ref = doc(db, "disputes", data.orderId);
  await setDoc(ref, { ...data, id: data.orderId, status: "open", createdAt: Date.now() });
  await updateDoc(doc(db, "orders", data.orderId), { status: "disputed" });

  const filerLabel = data.filedBy === "buyer" ? "Покупатель" : "Продавец";
  await sendOrderChatMessage(data.orderId, data.buyerId, data.sellerId, "system", `⚠️ ${filerLabel} открыл(а) спор — причина: ${data.reason}`);

  const otherParty = data.filedBy === "buyer" ? data.sellerId : data.buyerId;
  notifyTelegram(
    otherParty,
    data.filedBy === "buyer"
      ? `⚠️ Покупатель открыл спор по заказу — причина: ${data.reason}`
      : `⚠️ Продавец открыл спор на вас по заказу — причина: ${data.reason}`
  );

  // Уведомляем админов в Telegram, если у них привязан бот — молча игнорируем ошибку,
  // жалоба всё равно появится в /admin/disputes даже если уведомление не дошло.
  try {
    await fetch("/api/admin/notify-dispute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId: data.orderId, reason: data.reason, buyerName: data.buyerName, filedBy: data.filedBy }),
    });
  } catch {
    // не критично
  }
}

export async function getAllDisputes(): Promise<Dispute[]> {
  const snap = await getDocs(query(disputesCol, orderBy("createdAt", "desc")));
  return snap.docs.map((d) => d.data() as Dispute);
}

export async function getDispute(orderId: string): Promise<Dispute | null> {
  const snap = await getDoc(doc(db, "disputes", orderId));
  if (!snap.exists()) return null;
  return snap.data() as Dispute;
}

export async function resolveDispute(orderId: string, approve: boolean) {
  await updateDoc(doc(db, "disputes", orderId), { status: approve ? "approved" : "rejected", resolvedAt: Date.now() });
}
