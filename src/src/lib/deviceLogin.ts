import { doc, setDoc, getDoc, deleteDoc, onSnapshot } from "firebase/firestore";
import { db, auth } from "./firebase";

export const DEVICE_LOGIN_TTL_MS = 3 * 60 * 1000; // 3 минуты на подтверждение

export interface DeviceLoginRequest {
  status: "pending" | "approved" | "denied";
  createdAt: number;
  expiresAt: number;
  userAgent?: string;
  token?: string; // кастомный токен входа — появляется только после подтверждения
  approvedByUid?: string;
}

function randomCode(): string {
  // 32 случайных hex-символа (128 бит) — сам код и есть секрет, подобрать перебором нереально.
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Создаёт заявку на вход и возвращает её код — им кодируется QR и по нему идёт опрос статуса. */
export async function createDeviceLoginRequest(): Promise<string> {
  const code = randomCode();
  const now = Date.now();
  await setDoc(doc(db, "deviceLogins", code), {
    status: "pending",
    createdAt: now,
    expiresAt: now + DEVICE_LOGIN_TTL_MS,
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 200) : "",
  });
  return code;
}

/** Живая подписка на статус заявки — вызывается с устройства, которое ждёт входа. */
export function subscribeDeviceLogin(code: string, cb: (req: DeviceLoginRequest | null) => void) {
  return onSnapshot(doc(db, "deviceLogins", code), (snap) => {
    cb(snap.exists() ? (snap.data() as DeviceLoginRequest) : null);
  });
}

/** Разово прочитать заявку — используется на странице подтверждения (телефон), пока пользователь ещё не нажал "Подтвердить". */
export async function getDeviceLoginRequest(code: string): Promise<DeviceLoginRequest | null> {
  const snap = await getDoc(doc(db, "deviceLogins", code));
  return snap.exists() ? (snap.data() as DeviceLoginRequest) : null;
}

/** Удаляет уже использованную заявку — вызывается новым устройством сразу после успешного входа. */
export async function cleanupDeviceLoginRequest(code: string): Promise<void> {
  try {
    await deleteDoc(doc(db, "deviceLogins", code));
  } catch {
    // не критично — запись всё равно "протухнет" сама через TTL на сервере
  }
}

/** Подтвердить (или отклонить) вход с другого устройства — вызывается с уже залогиненного телефона. */
export async function respondToDeviceLogin(code: string, action: "approve" | "deny"): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error("Нужно войти в аккаунт");
  const idToken = await currentUser.getIdToken();
  const res = await fetch("/api/auth/device-login/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ code, action }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Не удалось подтвердить вход");
}
