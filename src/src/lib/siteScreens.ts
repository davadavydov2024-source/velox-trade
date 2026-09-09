import { doc, getDoc, setDoc, collection, getDocs } from "firebase/firestore";
import { db } from "./firebase";
import { SiteScreen } from "@/types";

const col = collection(db, "siteScreens");

export async function getSiteScreen(id: SiteScreen["id"]): Promise<SiteScreen | null> {
  const snap = await getDoc(doc(col, id));
  return snap.exists() ? (snap.data() as SiteScreen) : null;
}

export async function getAllSiteScreens(): Promise<SiteScreen[]> {
  const snap = await getDocs(col);
  return snap.docs.map((d) => d.data() as SiteScreen);
}

export async function saveSiteScreen(data: SiteScreen): Promise<void> {
  await setDoc(doc(col, data.id), { ...data, updatedAt: Date.now() });
}
