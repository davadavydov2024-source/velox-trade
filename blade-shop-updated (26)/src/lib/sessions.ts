import { collection, doc, getDoc, getDocs, setDoc, updateDoc, query, where } from "firebase/firestore";
import { db, auth } from "./firebase";
import { UserSession } from "@/types";
import { notifyTelegram } from "./telegramNotify";

const DEVICE_ID_KEY = "vt_device_id";

/** Как в Telegram: с устройства, на котором вошли меньше 25 часов назад, нельзя завершать
 * чужие сессии — это защищает владельца, если аккаунт всё же угнали (у угонщика будет доступ,
 * но не будет возможности выкинуть из аккаунта настоящего владельца). */
export const SESSION_TRUST_MS = 25 * 60 * 60 * 1000;

/** ID этого браузера — генерируется один раз и живёт в localStorage. */
export function getDeviceId(): string {
  if (typeof window === "undefined") return "server";
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

function parseUserAgent(ua: string): string {
  let os = "неизвестная ОС";
  if (/Windows/i.test(ua)) os = "Windows";
  else if (/iPhone/i.test(ua)) os = "iPhone";
  else if (/iPad/i.test(ua)) os = "iPad";
  else if (/Mac OS X/i.test(ua)) os = "macOS";
  else if (/Android/i.test(ua)) os = "Android";
  else if (/Linux/i.test(ua)) os = "Linux";

  let browser = "браузер";
  if (/Edg\//i.test(ua)) browser = "Edge";
  else if (/OPR\//i.test(ua) || /Opera/i.test(ua)) browser = "Opera";
  else if (/YaBrowser/i.test(ua)) browser = "Яндекс.Браузер";
  else if (/Firefox\//i.test(ua)) browser = "Firefox";
  else if (/Chrome\//i.test(ua) && !/Chromium/i.test(ua)) browser = "Chrome";
  else if (/Safari\//i.test(ua) && !/Chrome/i.test(ua)) browser = "Safari";

  return `${browser} · ${os}`;
}

function sessionRef(uid: string, deviceId: string) {
  return doc(db, "sessions", `${uid}_${deviceId}`);
}

/**
 * Вызывается при каждом входе (см. SessionManager). Если это устройство ещё ни разу не заходило
 * в аккаунт — или заходило, но эту сессию завершили с другого устройства — создаёт новую запись
 * и шлёт уведомление в Telegram "вход с нового устройства". Если устройство уже известно и
 * активно — просто обновляет "последняя активность", без уведомления на каждый визит.
 */
export async function registerSession(uid: string): Promise<void> {
  if (typeof window === "undefined") return;
  const deviceId = getDeviceId();
  const ref = sessionRef(uid, deviceId);
  const snap = await getDoc(ref);
  const deviceLabel = parseUserAgent(navigator.userAgent);
  const now = Date.now();

  if (!snap.exists() || (snap.data() as UserSession).revoked) {
    const session: UserSession = {
      uid,
      deviceId,
      deviceLabel,
      createdAt: now,
      lastActiveAt: now,
      revoked: false,
      revokedAt: null,
    };
    await setDoc(ref, session);
    notifyTelegram(
      uid,
      `🔔 Выполнен вход с нового устройства: ${deviceLabel}\n\nЕсли это были не вы — зайди в «Профиль → Безопасность» и заверши эту сессию.`
    );
  } else {
    await updateDoc(ref, { lastActiveAt: now, deviceLabel });
  }
}

/** Активные (не завершённые) сессии пользователя, последние по активности — первыми. */
export async function listSessions(uid: string): Promise<UserSession[]> {
  const snap = await getDocs(query(collection(db, "sessions"), where("uid", "==", uid)));
  return snap.docs
    .map((d) => d.data() as UserSession)
    .filter((s) => !s.revoked)
    .sort((a, b) => b.lastActiveAt - a.lastActiveAt);
}

export async function getCurrentSession(uid: string): Promise<UserSession | null> {
  const snap = await getDoc(sessionRef(uid, getDeviceId()));
  if (!snap.exists()) return null;
  return snap.data() as UserSession;
}

/** Можно ли с текущего устройства управлять (завершать) другими сессиями. */
export function canManageSessions(currentSession: UserSession | null): boolean {
  if (!currentSession) return false;
  return Date.now() - currentSession.createdAt >= SESSION_TRUST_MS;
}

/** Через сколько мс на этом устройстве откроется возможность завершать другие сессии (0, если уже можно). */
export function msUntilCanManage(currentSession: UserSession | null): number {
  if (!currentSession) return SESSION_TRUST_MS;
  return Math.max(0, SESSION_TRUST_MS - (Date.now() - currentSession.createdAt));
}

/** Завершает сессию на другом устройстве (или все остальные, если targetDeviceId === "all")
 * через серверный роут — там же проверяется правило "минимум 25 часов на текущем устройстве". */
export async function terminateSession(targetDeviceId: string | "all"): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error("Нужно войти в аккаунт");
  const idToken = await currentUser.getIdToken();
  const res = await fetch("/api/sessions/terminate", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ currentDeviceId: getDeviceId(), targetDeviceId }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Не удалось завершить сессию");
  }
}
