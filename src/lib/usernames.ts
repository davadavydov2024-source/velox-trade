import { doc, getDoc, setDoc, deleteDoc, updateDoc } from "firebase/firestore";
import { db } from "./firebase";

function normalize(username: string): string {
  return username.trim().toLowerCase();
}

export function isValidUsernameFormat(username: string): boolean {
  return /^[a-z0-9_]{3,20}$/.test(normalize(username));
}

const RESERVED_USERNAMES = new Set([
  "admin", "administrator", "support", "moderator", "mod", "staff", "system", "root", "owner",
  "help", "official", "bot", "null", "undefined", "api", "www",
]);

/** Текст ошибки для поля юзернейма или null, если формат подходит. Одна проверка на всех экранах. */
export function usernameFormatError(username: string): string | null {
  const n = normalize(username);
  if (!n) return "Придумай юзернейм — он обязателен";
  if (!/^[a-z0-9_]{3,20}$/.test(n)) return "Юзернейм: 3-20 символов, только латиница, цифры и подчёркивание";
  if (RESERVED_USERNAMES.has(n)) return "Этот юзернейм зарезервирован, выбери другой";
  return null;
}

export async function isUsernameAvailable(username: string): Promise<boolean> {
  const snap = await getDoc(doc(db, "usernames", normalize(username)));
  return !snap.exists();
}

export async function getUidByUsername(username: string): Promise<string | null> {
  const snap = await getDoc(doc(db, "usernames", normalize(username)));
  if (!snap.exists()) return null;
  return (snap.data() as { uid: string }).uid;
}

/**
 * Занимает новый username и освобождает старый (если был). Уникальность обеспечивается
 * правилом Firestore: запись в /usernames/{name} разрешена только если документа ещё нет
 * (создание нового username), повторная запись поверх существующего — запрещена.
 */
export async function claimUsername(uid: string, newUsername: string, oldUsername?: string | null) {
  const normalized = normalize(newUsername);
  if (!isValidUsernameFormat(normalized)) {
    throw new Error("invalid-format");
  }
  await setDoc(doc(db, "usernames", normalized), { uid, createdAt: Date.now() });
  if (oldUsername && normalize(oldUsername) !== normalized) {
    await deleteDoc(doc(db, "usernames", normalize(oldUsername))).catch(() => {});
  }
}

/**
 * Занимает юзернейм И сохраняет его в профиле пользователя одним вызовом — используется при
 * регистрации и в окне «придумай юзернейм» (UsernameGate). Бросает Error("username-taken"),
 * если имя уже занято, и Error("invalid-format") при неверном формате.
 */
export async function saveMyUsername(uid: string, username: string, oldUsername?: string | null) {
  const err = usernameFormatError(username);
  if (err) throw new Error("invalid-format");
  if (!(await isUsernameAvailable(username))) throw new Error("username-taken");
  await claimUsername(uid, username, oldUsername);
  await updateDoc(doc(db, "users", uid), { username: normalize(username) });
}
