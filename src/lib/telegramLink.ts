import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "./firebase";

export interface TelegramLink {
  chatId: number;
  telegramUsername: string | null;
  linkedAt: number;
}

function randomLinkCode(): string {
  // 20 случайных символов из безопасного алфавита — достаточно, чтобы код нельзя было угадать перебором.
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 20; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

/** Создаёт заявку на привязку Telegram и возвращает код для deep-ссылки на бота. */
export async function createTelegramLinkRequest(uid: string): Promise<string> {
  const code = randomLinkCode();
  await setDoc(doc(db, "telegramLinkRequests", code), { uid, createdAt: Date.now() });
  return code;
}

/** Возвращает текущую привязку Telegram пользователя, если она есть. */
export async function getTelegramLink(uid: string): Promise<TelegramLink | null> {
  const snap = await getDoc(doc(db, "telegramLinks", uid));
  if (!snap.exists()) return null;
  return snap.data() as TelegramLink;
}
