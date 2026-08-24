export interface PublicProfile {
  uid: string;
  displayName: string;
  username: string | null;
  bio?: string;
  photoURL: string | null;
  badges: import("@/types").UserBadge[];
  ratingSum: number;
  ratingCount: number;
  createdAt: number | null;
  isOnline: boolean;
  lastActiveAt: number | null;
}

const cache = new Map<string, Promise<PublicProfile | null>>();

async function fetchPublicProfile(uid: string): Promise<PublicProfile | null> {
  try {
    const res = await fetch(`/api/public-profile?uid=${encodeURIComponent(uid)}`);
    const data = await res.json();
    return data.profile ?? null;
  } catch {
    return null;
  }
}

/** Публичная (безопасная) информация о продавце — кэшируется, чтобы много карточек одного
 * продавца на странице не плодили повторные запросы. Раньше здесь читали users/{uid} напрямую
 * с клиента, но правила Firestore разрешают читать чужой профиль только владельцу/админу —
 * поэтому теперь используем серверный роут /api/public-profile, отдающий только безопасное
 * подмножество полей (без email, баланса и т.п.). */
export function getPublicProfileCached(uid: string): Promise<PublicProfile | null> {
  if (uid === "store") return Promise.resolve(null);
  if (!cache.has(uid)) {
    cache.set(uid, fetchPublicProfile(uid));
  }
  return cache.get(uid)!;
}
