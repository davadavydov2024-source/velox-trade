import { doc, getDoc, setDoc, deleteDoc } from "firebase/firestore";
import { db } from "./firebase";

function normalize(username: string): string {
  return username.trim().toLowerCase();
}

export function isValidUsernameFormat(username: string): boolean {
  return /^[a-z0-9_]{3,20}$/.test(normalize(username));
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
