import { doc, getDoc } from "firebase/firestore";
import { db } from "./firebase";

export async function getPublicStats(): Promise<{ dealsCount: number }> {
  const snap = await getDoc(doc(db, "stats", "public"));
  return { dealsCount: snap.exists() ? (snap.data().dealsCount ?? 0) : 0 };
}
