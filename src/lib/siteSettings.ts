import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "./firebase";
import { DEFAULT_SITE_SETTINGS, SiteSettings } from "@/types";

const SETTINGS_DOC = doc(db, "settings", "site");

export async function getSiteSettings(): Promise<SiteSettings> {
  const snap = await getDoc(SETTINGS_DOC);
  if (!snap.exists()) return DEFAULT_SITE_SETTINGS;
  return { ...DEFAULT_SITE_SETTINGS, ...snap.data() } as SiteSettings;
}

export async function saveSiteSettings(settings: Omit<SiteSettings, "updatedAt">) {
  return setDoc(SETTINGS_DOC, { ...settings, updatedAt: Date.now() });
}
