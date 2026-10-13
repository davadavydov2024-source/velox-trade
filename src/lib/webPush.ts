import { collection, query, where, getDocs, deleteDoc } from "firebase/firestore";
import { db, auth, activeApp } from "./firebase";

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_FCM_VAPID_KEY;

// У сайта два service worker'а: общий /sw.js (кэш/PWA, scope "/") и этот — для push. Раньше оба
// регистрировались на scope "/", а на одном scope живёт только один SW: каждая регистрация
// вытесняла предыдущую, и в итоге push приходил в SW, который его не обрабатывает. Поэтому push-SW
// получает СВОЙ scope и явно передаётся в getToken.
const PUSH_SW_URL = "/firebase-messaging-sw.js";
const PUSH_SW_SCOPE = "/firebase-cloud-messaging-push-scope";

async function getMessagingSafe() {
  if (typeof window === "undefined") return null;
  const { isSupported, getMessaging } = await import("firebase/messaging");
  if (!(await isSupported())) return null; // Safari вне PWA на iOS и т.п.
  const registration = await navigator.serviceWorker.register(PUSH_SW_URL, { scope: PUSH_SW_SCOPE, updateViaCache: "none" });
  // Ждём именно ЭТОТ SW, а не navigator.serviceWorker.ready (оно относится к основному scope "/").
  if (!registration.active) {
    const worker = registration.installing || registration.waiting;
    if (worker) {
      await new Promise<void>((resolve) => {
        if (worker.state === "activated") return resolve();
        worker.addEventListener("statechange", () => worker.state === "activated" && resolve());
        setTimeout(resolve, 8000); // страховка, чтобы не зависнуть навсегда
      });
    }
  }
  return { messaging: getMessaging(activeApp), registration };
}

export function isPushSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "Notification" in window;
}

export async function getPushPermissionState(): Promise<NotificationPermission | "unsupported"> {
  if (!isPushSupported()) return "unsupported";
  return Notification.permission;
}

async function fetchToken(): Promise<string | null> {
  const ctx = await getMessagingSafe();
  if (!ctx || !VAPID_PUBLIC) return null;
  const { getToken } = await import("firebase/messaging");
  return getToken(ctx.messaging, { vapidKey: VAPID_PUBLIC, serviceWorkerRegistration: ctx.registration }).catch(() => null);
}

async function saveTokenOnServer(token: string) {
  // Через сервер: он убирает дубли и отвязывает токен от прежнего аккаунта на этом устройстве.
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) throw new Error("not-signed-in");
  const res = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ token }),
  });
  if (!res.ok) throw new Error("subscribe-failed");
}

/** Проверяет, есть ли у ЭТОГО браузера уже сохранённый FCM-токен для юзера. */
export async function hasActiveSubscription(uid: string): Promise<boolean> {
  if (!isPushSupported() || Notification.permission !== "granted") return false;
  const token = await fetchToken();
  if (!token) return false;
  const snap = await getDocs(query(collection(db, "pushSubscriptions"), where("uid", "==", uid), where("token", "==", token)));
  return !snap.empty;
}

export async function subscribeToPush(uid: string): Promise<void> {
  const ctx = await getMessagingSafe();
  if (!ctx) throw new Error("push-unsupported");
  if (!VAPID_PUBLIC) throw new Error("vapid-not-configured");

  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("permission-denied");

  const { getToken } = await import("firebase/messaging");
  const token = await getToken(ctx.messaging, { vapidKey: VAPID_PUBLIC, serviceWorkerRegistration: ctx.registration });
  if (!token) throw new Error("token-failed");
  await saveTokenOnServer(token);
  void uid;
}

/**
 * Тихая синхронизация: если разрешение на уведомления уже дано, получаем актуальный токен и
 * (пере)сохраняем его на сервере. Лечит три случая: токен сменился (FCM их периодически
 * обновляет), токен остался от старой регистрации SW (до исправления scope), и вход в другой
 * аккаунт на том же браузере. Окон и запросов разрешения не показывает.
 */
export async function syncPushSubscriptionSilently(): Promise<void> {
  if (!isPushSupported() || Notification.permission !== "granted" || !VAPID_PUBLIC) return;
  const token = await fetchToken();
  if (token) await saveTokenOnServer(token);
}

export async function unsubscribeFromPush(uid: string): Promise<void> {
  const ctx = await getMessagingSafe();
  if (!ctx) return;
  const { getToken, deleteToken } = await import("firebase/messaging");
  const token = await getToken(ctx.messaging, { vapidKey: VAPID_PUBLIC, serviceWorkerRegistration: ctx.registration }).catch(() => null);
  if (token) {
    await deleteToken(ctx.messaging).catch(() => {});
    const snap = await getDocs(query(collection(db, "pushSubscriptions"), where("uid", "==", uid), where("token", "==", token)));
    await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
  }
}
