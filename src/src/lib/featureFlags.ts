import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "./firebase";
import { DEFAULT_FEATURE_FLAGS, FeatureFlags } from "@/types";

const FLAGS_DOC = doc(db, "settings", "features");

export async function getFeatureFlags(): Promise<FeatureFlags> {
  try {
    const snap = await getDoc(FLAGS_DOC);
    if (!snap.exists()) return DEFAULT_FEATURE_FLAGS;
    return { ...DEFAULT_FEATURE_FLAGS, ...snap.data() } as FeatureFlags;
  } catch {
    // Если правила ещё не опубликованы или сеть недоступна — не блокируем сайт, используем дефолт (всё включено)
    return DEFAULT_FEATURE_FLAGS;
  }
}

export async function saveFeatureFlags(flags: Omit<FeatureFlags, "updatedAt">) {
  return setDoc(FLAGS_DOC, { ...flags, updatedAt: Date.now() });
}
