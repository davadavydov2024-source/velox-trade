import { collection, addDoc, query, where, getDocs, deleteDoc } from "firebase/firestore";
import { getMessaging, getToken, deleteToken, isSupported } from "firebase/messaging";
import { db, activeApp } from "./firebase";

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_FCM_VAPID_KEY;

// FCM требует свой собственный service worker — firebase-messaging-sw.js (см. public/), а не
// общий /sw.js. Регистрируем его лениво, при первом обращении, а не при каждой загрузке страницы.
async function getMessagingSafe() {
  if (typeof window === "undefined") return null;
  if (!(await isSupported())) return null; // Safari вне PWA на iOS и т.п. — как и раньше с PushManager
  const reg = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
  await navigator.serviceWorker.ready;
  return getMessaging(activeApp);
}

export function isPushSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "Notification" in window;
}

export async function getPushPermissionState(): Promise<NotificationPermission | "unsupported"> {
  if (!isPushSupported()) return "unsupported";
  return Notification.permission;
}

/** Проверяет, есть ли у ЭТОГО браузера уже сохранённый FCM-токен для юзера. */
export async function hasActiveSubscription(uid: string): Promise<boolean> {
  const messaging = await getMessagingSafe();
  if (!messaging || !VAPID_PUBLIC) return false;
  // getToken() без принудительного запроса разрешения — если пользователь уже разрешил и токен
  // существует, вернёт его; если разрешения ещё нет, бросит ошибку — трактуем как "не подписан".
  const token = await getToken(messaging, { vapidKey: VAPID_PUBLIC }).catch(() => null);
  if (!token) return false;
  const snap = await getDocs(query(collection(db, "pushSubscriptions"), where("uid", "==", uid), where("token", "==", token)));
  return !snap.empty;
}

export async function subscribeToPush(uid: string): Promise<void> {
  const messaging = await getMessagingSafe();
  if (!messaging) throw new Error("push-unsupported");
  if (!VAPID_PUBLIC) throw new Error("vapid-not-configured");

  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("permission-denied");

  const token = await getToken(messaging, { vapidKey: VAPID_PUBLIC });

  await addDoc(collection(db, "pushSubscriptions"), {
    uid,
    token,
    createdAt: Date.now(),
  });
}

export async function unsubscribeFromPush(uid: string): Promise<void> {
  const messaging = await getMessagingSafe();
  if (!messaging) return;
  const token = await getToken(messaging, { vapidKey: VAPID_PUBLIC }).catch(() => null);
  if (token) {
    await deleteToken(messaging).catch(() => {});
    const snap = await getDocs(query(collection(db, "pushSubscriptions"), where("uid", "==", uid), where("token", "==", token)));
    await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
  }
}

