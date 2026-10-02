import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "./firebase";

const SETTINGS_DOC = doc(db, "settings", "telegramBot");

export interface TelegramBotSettings {
  welcomeImage: string; // "" — фото не задано, бот шлёт обычным текстом
}

export async function getTelegramBotSettings(): Promise<TelegramBotSettings> {
  const snap = await getDoc(SETTINGS_DOC);
  if (!snap.exists()) return { welcomeImage: "" };
  return { welcomeImage: "", ...snap.data() } as TelegramBotSettings;
}

export async function saveTelegramWelcomeImage(welcomeImage: string) {
  return setDoc(SETTINGS_DOC, { welcomeImage }, { merge: true });
}
