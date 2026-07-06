import { collection, doc, getDoc, getDocs, setDoc, updateDoc, query, orderBy } from "firebase/firestore";
import { db } from "./firebase";
import { Dispute } from "@/types";

const disputesCol = collection(db, "disputes");

export async function createDispute(data: Omit<Dispute, "id" | "status" | "createdAt">) {
  const ref = doc(db, "disputes", data.orderId);
  await setDoc(ref, { ...data, id: data.orderId, status: "open", createdAt: Date.now() });
  await updateDoc(doc(db, "orders", data.orderId), { status: "disputed" });

  // Уведомляем админов в Telegram, если у них привязан бот — молча игнорируем ошибку,
  // жалоба всё равно появится в /admin/disputes даже если уведомление не дошло.
  try {
    await fetch("/api/admin/notify-dispute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId: data.orderId, reason: data.reason, buyerName: data.buyerName }),
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
