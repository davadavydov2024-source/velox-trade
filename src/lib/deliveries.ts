import { collection, doc, getDoc, getDocs, onSnapshot, query, orderBy } from "firebase/firestore";
import { db, auth } from "./firebase";
import { Delivery, DeliveryStatus } from "@/types";

const col = collection(db, "deliveries");

export const DELIVERY_TIMEOUT_MS = 60 * 60 * 1000; // 1 час на весь процесс выдачи

export async function getDeliveryByOrderId(orderId: string): Promise<Delivery | null> {
  const snap = await getDoc(doc(db, "deliveries", orderId));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as Delivery) : null;
}

/** Живая подписка — статус выдачи обновляется у обеих сторон сам, без перезагрузки страницы. */
export function subscribeDelivery(orderId: string, cb: (d: Delivery | null) => void) {
  return onSnapshot(doc(db, "deliveries", orderId), (snap) => {
    cb(snap.exists() ? ({ id: snap.id, ...snap.data() } as Delivery) : null);
  });
}

/** Для админки: все выдачи, новые сверху. */
export async function getAllDeliveries(): Promise<Delivery[]> {
  const snap = await getDocs(query(col, orderBy("createdAt", "desc")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Delivery);
}

/** Покупатель один раз вписывает свой игровой ник — дальше сервер сам назначает бота-посредника и запускает выдачу. */
export async function submitDeliveryNickname(orderId: string, nickname: string): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error("Нужно войти в аккаунт");
  const idToken = await currentUser.getIdToken();
  const res = await fetch("/api/deliveries/submit-nickname", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ orderId, nickname }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Не удалось сохранить ник");
}

/** Только для админа: продвигает статус выдачи после ручной проверки в самой игре, либо отменяет её. */
export async function adminUpdateDeliveryStatus(
  orderId: string,
  status: Extract<DeliveryStatus, "received_by_bot" | "delivered" | "cancelled">,
  cancelReason?: string
): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error("Нужно войти в аккаунт");
  const idToken = await currentUser.getIdToken();
  const res = await fetch("/api/admin/deliveries/update-status", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ orderId, status, cancelReason }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Не удалось обновить статус");
}
