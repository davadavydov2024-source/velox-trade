import { doc, setDoc } from "firebase/firestore";
import { db } from "./firebase";

function randomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 20; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

/** Создаёт заявку на регистрацию нового аккаунта через Telegram и возвращает код для deep-ссылки на бота. */
export async function createTelegramRegisterRequest(email: string, displayName: string): Promise<string> {
  const code = randomCode();
  await setDoc(doc(db, "telegramRegisterRequests", code), {
    email: email.trim().toLowerCase(),
    displayName: displayName.trim(),
    status: "pending",
    createdAt: Date.now(),
  });
  return code;
}
