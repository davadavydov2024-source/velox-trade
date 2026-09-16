import { doc, getDoc } from "firebase/firestore";
import { db, auth } from "./firebase";
import { RobloxLink } from "@/types";

export async function getRobloxLink(uid: string): Promise<RobloxLink | null> {
  const snap = await getDoc(doc(db, "robloxLinks", uid));
  return snap.exists() ? (snap.data() as RobloxLink) : null;
}

async function authedFetch(url: string, body?: unknown) {
  const idToken = await auth.currentUser?.getIdToken();
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Ошибка запроса");
  return data;
}

export async function startRobloxVerification(username: string) {
  return authedFetch("/api/roblox/verify/start", { username }) as Promise<{
    code: string;
    robloxUserId: number;
    robloxUsername: string;
    robloxDisplayName: string;
    avatarUrl: string | null;
    profileUrl: string;
  }>;
}

export async function confirmRobloxVerification() {
  return authedFetch("/api/roblox/verify/confirm") as Promise<{
    ok: true;
    robloxUsername: string;
    robloxDisplayName: string;
    avatarUrl: string | null;
  }>;
}

export async function unlinkRoblox() {
  return authedFetch("/api/roblox/unlink") as Promise<{ ok: true }>;
}

export interface RobloxInventoryItem {
  id: number;
  name: string;
  imageUrl: string | null;
}

export async function getRobloxInventory(userId: number) {
  const res = await fetch(`/api/roblox/inventory?userId=${userId}`);
  const data = await res.json();
  return data as { collectibles: RobloxInventoryItem[]; collectiblesPrivate: boolean; worn: RobloxInventoryItem[] };
}
