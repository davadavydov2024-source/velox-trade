import { collection, addDoc, getDocs, query, orderBy, doc, updateDoc, deleteDoc } from "firebase/firestore";
import { db } from "./firebase";
import { SiteEvent } from "@/types";

const eventsCol = collection(db, "events");

export async function getAllEvents(): Promise<SiteEvent[]> {
  const snap = await getDocs(query(eventsCol, orderBy("createdAt", "desc")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as SiteEvent);
}

/** Возвращает первый активный ивент (обычно активен только один за раз) или null. */
export async function getActiveEvent(): Promise<SiteEvent | null> {
  const all = await getAllEvents();
  return all.find((e) => e.active) ?? null;
}

export async function createEvent(data: Omit<SiteEvent, "id" | "createdAt">) {
  return addDoc(eventsCol, { ...data, createdAt: Date.now() });
}

export async function updateEvent(id: string, data: Partial<Omit<SiteEvent, "id" | "createdAt">>) {
  return updateDoc(doc(db, "events", id), data);
}

export async function deleteEvent(id: string) {
  return deleteDoc(doc(db, "events", id));
}
