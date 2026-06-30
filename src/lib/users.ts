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
import { Order, TopUpRequest, UserProfile, UserBadge } from "@/types";

const usersCol = collection(db, "users");
const ordersCol = collection(db, "orders");
const topUpsCol = collection(db, "topups");

export async function ensureUserProfile(uid: string, email: string, displayName: string, photoURL?: string) {
  if (snap.exists()) {
  await updateDoc(ref, { lastLoginAt: Date.now() });
  return {
    uid: snap.id,
    ...snap.data(),
  } as UserProfile;
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
  const snap = await getDocs(query(ordersCol, where("userId", "==", userId), orderBy("createdAt", "desc")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Order);
}

export async function getAllOrders(): Promise<Order[]> {
  const snap = await getDocs(query(ordersCol, orderBy("createdAt", "desc")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Order);
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

// ---- Admin check ----

export function isAdminUid(uid: string | null | undefined): boolean {
  if (!uid) return false;
  const list = (process.env.NEXT_PUBLIC_ADMIN_UIDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return list.includes(uid);
}
