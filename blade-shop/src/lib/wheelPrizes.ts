import { collection, addDoc, getDocs, query, orderBy, doc, updateDoc, deleteDoc } from "firebase/firestore";
import { db } from "./firebase";
import { WheelPrize } from "@/types";

const prizesCol = collection(db, "wheelPrizes");

export async function getAllWheelPrizes(): Promise<WheelPrize[]> {
  const snap = await getDocs(query(prizesCol, orderBy("createdAt", "desc")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as WheelPrize);
}

export async function createWheelPrize(data: Omit<WheelPrize, "id" | "createdAt">) {
  return addDoc(prizesCol, { ...data, createdAt: Date.now() });
}

export async function updateWheelPrize(id: string, changes: Partial<WheelPrize>) {
  return updateDoc(doc(db, "wheelPrizes", id), changes);
}

export async function deleteWheelPrize(id: string) {
  return deleteDoc(doc(db, "wheelPrizes", id));
}
