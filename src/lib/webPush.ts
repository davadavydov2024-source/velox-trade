import { collection, addDoc, query, where, getDocs, deleteDoc } from "firebase/firestore";
import { db } from "./firebase";

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export function isPushSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;
}

export async function getPushPermissionState(): Promise<NotificationPermission | "unsupported"> {
  if (!isPushSupported()) return "unsupported";
  return Notification.permission;
}

/** Проверяет, есть ли у ЭТОГО браузера уже сохранённая подписка для юзера. */
export async function hasActiveSubscription(uid: string): Promise<boolean> {
  if (!isPushSupported()) return false;
  const reg = await navigator.serviceWorker.getRegistration();
  const existing = await reg?.pushManager.getSubscription();
  if (!existing) return false;
  const snap = await getDocs(query(collection(db, "pushSubscriptions"), where("uid", "==", uid), where("endpoint", "==", existing.endpoint)));
  return !snap.empty;
}

export async function subscribeToPush(uid: string): Promise<void> {
  if (!isPushSupported()) throw new Error("push-unsupported");
  if (!VAPID_PUBLIC) throw new Error("vapid-not-configured");

  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("permission-denied");

  const reg = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;

  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC) as BufferSource,
  });

  const json = sub.toJSON();
  await addDoc(collection(db, "pushSubscriptions"), {
    uid,
    endpoint: json.endpoint,
    keys: json.keys,
    createdAt: Date.now(),
  });
}

export async function unsubscribeFromPush(uid: string): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    const endpoint = sub.endpoint;
    await sub.unsubscribe().catch(() => {});
    const snap = await getDocs(query(collection(db, "pushSubscriptions"), where("uid", "==", uid), where("endpoint", "==", endpoint)));
    await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
  }
}
