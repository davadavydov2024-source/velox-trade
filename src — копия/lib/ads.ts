import {
  collection,
  doc,
  getDocs,
  query,
  orderBy,
  addDoc,
  updateDoc,
  deleteDoc,
} from "firebase/firestore";
import { db } from "./firebase";
import { Ad } from "@/types";

const adsCol = collection(db, "ads");

export async function getAds(activeOnly = false): Promise<Ad[]> {
  const snap = await getDocs(query(adsCol, orderBy("priority", "desc")));
  const ads = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Ad);
  if (!activeOnly) return ads;
  const now = Date.now();
  return ads.filter((a) => a.active && (a.endsAt === null || a.endsAt > now));
}

export async function createAd(data: Omit<Ad, "id" | "createdAt">) {
  return addDoc(adsCol, { ...data, createdAt: Date.now() });
}

export async function updateAd(id: string, data: Partial<Ad>) {
  return updateDoc(doc(db, "ads", id), data);
}

export async function deleteAd(id: string) {
  return deleteDoc(doc(db, "ads", id));
}
