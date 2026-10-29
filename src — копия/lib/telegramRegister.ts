import { randomToken as secureRandomToken } from "./secureRandom";
import { doc, setDoc } from "firebase/firestore";
import { db } from "./firebase";

function randomCode(): string {
  return secureRandomToken(20);
}

/** Создаёт заявку на регистрацию нового аккаунта через Telegram и возвращает код для deep-ссылки на бота. */
export async function createTelegramRegisterRequest(email: string, displayName: string, age?: number, username?: string): Promise<string> {
  const code = randomCode();
  await setDoc(doc(db, "telegramRegisterRequests", code), {
    email: email.trim().toLowerCase(),
    displayName: displayName.trim(),
    status: "pending",
    createdAt: Date.now(),
    ...(age !== undefined ? { age } : {}),
    ...(username ? { username: username.trim().toLowerCase() } : {}),
  });
  return code;
}
