import { collection, addDoc, getDocs, query, orderBy, doc, updateDoc, deleteDoc } from "firebase/firestore";
import { db } from "./firebase";
import { AppNotification } from "@/types";

const notificationsCol = collection(db, "notifications");

export async function getAllNotifications(): Promise<AppNotification[]> {
  const snap = await getDocs(query(notificationsCol, orderBy("createdAt", "desc")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as AppNotification);
}

/** Активные уведомления для колокольчика на сайте — закреплённые сначала, дальше по дате. */
export async function getActiveNotifications(): Promise<AppNotification[]> {
  const all = await getAllNotifications();
  return all
    .filter((n) => n.active)
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt - a.createdAt);
}

export async function createNotification(data: Omit<AppNotification, "id" | "createdAt">) {
  return addDoc(notificationsCol, { ...data, createdAt: Date.now() });
}

export async function updateNotification(id: string, data: Partial<Omit<AppNotification, "id" | "createdAt">>) {
  return updateDoc(doc(db, "notifications", id), data);
}

export async function deleteNotification(id: string) {
  return deleteDoc(doc(db, "notifications", id));
}
