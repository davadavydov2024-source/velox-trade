import { getUserProfile } from "./users";
import { UserProfile } from "@/types";

const cache = new Map<string, Promise<UserProfile | null>>();

/** Отдаёт профиль продавца, кэшируя запрос — если на странице много карточек одного и того же
 * продавца, Firestore читается только один раз. */
export function getSellerProfileCached(uid: string): Promise<UserProfile | null> {
  if (uid === "store") return Promise.resolve(null); // "store" — товары от площадки, не от продавца
  if (!cache.has(uid)) {
    cache.set(uid, getUserProfile(uid).catch(() => null));
  }
  return cache.get(uid)!;
}
