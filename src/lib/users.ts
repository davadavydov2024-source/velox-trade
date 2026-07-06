import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  addDoc,
  increment,
} from "firebase/firestore";
import { db } from "./firebase";
import { Order, TopUpRequest, UserProfile, UserBadge, NAME_CHANGE_COOLDOWN_MS } from "@/types";

const usersCol = collection(db, "users");
const ordersCol = collection(db, "orders");
const topUpsCol = collection(db, "topups");

export async function ensureUserProfile(uid: string, email: string, displayName: string, photoURL?: string) {
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    await updateDoc(ref, { lastLoginAt: Date.now() });
    return { uid: snap.id, ...snap.data() } as UserProfile;
  }
  const profile: Omit<UserProfile, "uid"> = {
    email,
    displayName,
    photoURL: photoURL ?? null,
    balance: 0,
    badges: ["user"],
    emailVerified: false,
    banned: false,
    createdAt: Date.now(),
    lastLoginAt: Date.now(),
  };
  await setDoc(ref, profile);
  return { uid, ...profile } as UserProfile;
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const snap = await getDoc(doc(db, "users", uid));
  if (!snap.exists()) return null;
  return { uid, ...snap.data() } as UserProfile;
}

export async function getAllUsers(): Promise<UserProfile[]> {
  const snap = await getDocs(query(usersCol, orderBy("createdAt", "desc")));
  return snap.docs.map((d) => ({ uid: d.id, ...d.data() }) as UserProfile);
}

export async function setUserBalance(uid: string, newBalance: number) {
  return updateDoc(doc(db, "users", uid), { balance: newBalance });
}

export async function adjustUserBalance(uid: string, delta: number) {
  return updateDoc(doc(db, "users", uid), { balance: increment(delta) });
}

export async function setUserBadges(uid: string, badges: UserBadge[]) {
  return updateDoc(doc(db, "users", uid), { badges });
}

export async function setUserBan(uid: string, banned: boolean, reason?: string, until?: number | "forever" | null) {
  return updateDoc(doc(db, "users", uid), {
    banned,
    banReason: reason ?? null,
    banUntil: until ?? null,
  });
}

// ---- Orders ----

export async function createOrder(order: Omit<Order, "id" | "createdAt">) {
  return addDoc(ordersCol, { ...order, createdAt: Date.now() });
}

export async function getOrdersForUser(userId: string): Promise<Order[]> {
  // Без orderBy: where + orderBy на разных полях требует составного индекса в Firestore.
  // Сортируем на клиенте, чтобы не заставлять админа вручную создавать индекс в консоли.
  const snap = await getDocs(query(ordersCol, where("userId", "==", userId)));
  const orders = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Order);
  return orders.sort((a, b) => b.createdAt - a.createdAt);
}

export async function getAllOrders(): Promise<Order[]> {
  const snap = await getDocs(query(ordersCol, orderBy("createdAt", "desc")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Order);
}

export async function getOrderById(orderId: string): Promise<Order | null> {
  const snap = await getDoc(doc(db, "orders", orderId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Order;
}

/** Покупатель подтверждает получение предмета — только после этого можно оставить отзыв. */
export async function confirmOrderReceipt(orderId: string) {
  return updateDoc(doc(db, "orders", orderId), { status: "confirmed", confirmedAt: Date.now() });
}

/**
 * Обновляет ник и/или аватар с недельным ограничением на смену (защита от спама сменой ника).
 * Бросает Error с кодом "name-cooldown" / "avatar-cooldown", если срок ещё не прошёл.
 */
export async function updateProfileInfo(
  uid: string,
  current: UserProfile,
  changes: { displayName?: string; photoURL?: string | null; bio?: string; username?: string }
) {
  const now = Date.now();
  const update: Record<string, unknown> = {};

  if (changes.displayName !== undefined && changes.displayName !== current.displayName) {
    if (current.lastNameChangeAt && now - current.lastNameChangeAt < NAME_CHANGE_COOLDOWN_MS) {
      const err = new Error("Ник можно менять раз в 7 дней");
      (err as any).code = "name-cooldown";
      throw err;
    }
    update.displayName = changes.displayName;
    update.lastNameChangeAt = now;
  }

  if (changes.photoURL !== undefined && changes.photoURL !== current.photoURL) {
    if (current.lastAvatarChangeAt && now - current.lastAvatarChangeAt < NAME_CHANGE_COOLDOWN_MS) {
      const err = new Error("Аватар можно менять раз в 7 дней");
      (err as any).code = "avatar-cooldown";
      throw err;
    }
    update.photoURL = changes.photoURL;
    update.lastAvatarChangeAt = now;
  }

  if (changes.bio !== undefined) {
    update.bio = changes.bio;
  }

  // ВАЖНО: юзернейм нужно сохранить не только в отдельной коллекции "usernames" (там резервируется
  // уникальность), но и в самом документе пользователя — иначе после перезагрузки страницы он пропадает.
  if (changes.username !== undefined && changes.username !== current.username) {
    update.username = changes.username;
  }

  if (Object.keys(update).length > 0) {
    await updateDoc(doc(db, "users", uid), update);
  }
}

// ---- Top-up requests (ручное пополнение через Telegram-админа) ----

export async function createTopUpRequest(data: Omit<TopUpRequest, "id" | "createdAt" | "status">) {
  return addDoc(topUpsCol, { ...data, status: "pending", createdAt: Date.now() });
}

export async function getTopUpRequests(): Promise<TopUpRequest[]> {
  const snap = await getDocs(query(topUpsCol, orderBy("createdAt", "desc")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as TopUpRequest);
}

export async function setTopUpStatus(id: string, status: "approved" | "rejected") {
  return updateDoc(doc(db, "topups", id), { status });
}

/** Админ: принудительно обновляет сайт у ВСЕХ пользователей (перезагрузка страницы у всех вкладок). */
export async function forceReloadAllUsers() {
  return setDoc(doc(db, "settings", "forceReload"), { timestamp: Date.now() });
}

/** Админ: принудительно обновляет сайт у ОДНОГО конкретного пользователя. */
export async function forceReloadUser(uid: string) {
  return updateDoc(doc(db, "users", uid), { forceReloadAt: Date.now() });
}

// ---- Admin check ----

export function isAdminUid(uid: string | null | undefined): boolean {
  if (!uid) return false;
  const list = (process.env.NEXT_PUBLIC_ADMIN_UIDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return list.includes(uid);
}
