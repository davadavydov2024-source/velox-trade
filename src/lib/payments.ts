import { collection, doc, getDoc, getDocs, query, where, onSnapshot } from "firebase/firestore";
import { db, auth } from "./firebase";
import { Payment } from "@/types";

const paymentsCol = collection(db, "payments");

/** Создаёт платёж через CactusPay и возвращает ссылку на страницу оплаты. */
export async function createCactusPayment(amount: number): Promise<{ url: string; orderId: string }> {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error("Нужно войти в аккаунт");

  const idToken = await currentUser.getIdToken();
  const res = await fetch("/api/payments/create", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ amount }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "Не удалось создать платёж");
  }
  return { url: data.url, orderId: data.orderId };
}

export async function getUserPayments(userId: string): Promise<Payment[]> {
  const snap = await getDocs(query(paymentsCol, where("userId", "==", userId)));
  const payments = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Payment);
  return payments.sort((a, b) => b.createdAt - a.createdAt);
}

/** Отменяет платёж, который всё ещё "Ждём оплату" (сервер перепроверяет статус у CactusPay перед отменой). */
export async function cancelPayment(orderId: string): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error("Нужно войти в аккаунт");

  const idToken = await currentUser.getIdToken();
  const res = await fetch("/api/payments/cancel", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ orderId }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "Не удалось отменить платёж");
  }
}

/** Автоматически отменяет собственные просроченные платежи пользователя (если он ушёл и не заплатил). */
export async function sweepExpiredPayments(): Promise<{ cancelled: number; credited: number }> {
  const currentUser = auth.currentUser;
  if (!currentUser) return { cancelled: 0, credited: 0 };
  const idToken = await currentUser.getIdToken();
  const res = await fetch("/api/payments/sweep-expired", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
  });
  if (!res.ok) return { cancelled: 0, credited: 0 };
  return res.json();
}

/** Админ: отменяет прямо сейчас все платежи "Ждём оплату" у всех пользователей. */
export async function cancelAllPendingPayments(): Promise<{ total: number; cancelled: number; credited: number; failed: number }> {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error("Нужно войти в аккаунт");
  const idToken = await currentUser.getIdToken();
  const res = await fetch("/api/admin/cancel-all-pending-payments", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Не удалось выполнить массовую отмену");
  return data;
}

export async function getPayment(orderId: string): Promise<Payment | null> {
  const snap = await getDoc(doc(db, "payments", orderId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Payment;
}

/** Слушает изменение статуса конкретного платежа в реальном времени (например, пока ждём вебхук). */
export function watchPayment(orderId: string, callback: (payment: Payment | null) => void) {
  return onSnapshot(doc(db, "payments", orderId), (snap) => {
    callback(snap.exists() ? ({ id: snap.id, ...snap.data() } as Payment) : null);
  });
}
