import { adminDb } from "./firebaseAdmin";
import { isAdminUid } from "./isAdmin";

/**
 * Можно ли пользователю `caller` слать уведомление пользователю `target` через /api/notify/*.
 * Раньше эти роуты были открыты всем — любой мог слать кому угодно любой текст «от имени сайта».
 * Теперь: себе, админам, персоналу, либо тем, с кем есть реальная связь (заказ, обмен, личная переписка).
 */
export async function mayNotify(caller: string, target: string): Promise<boolean> {
  if (!caller || !target) return false;
  if (caller === target) return true;
  if (isAdminUid(caller) || isAdminUid(target)) return true;
  const db = adminDb();
  try {
    const [callerSnap, dm] = await Promise.all([
      db.collection("users").doc(caller).get(),
      db.collection("directConversations").doc([caller, target].sort().join("_")).get(),
    ]);
    const role = callerSnap.data()?.staffRole;
    if (role === "manager" || role === "helper") return true;
    if (dm.exists) return true;
    const rel = async (col: string, a: string, b: string) =>
      !(await db.collection(col).where(a, "==", caller).where(b, "==", target).limit(1).get()).empty;
    const results = await Promise.all([
      rel("orders", "userId", "sellerId"),
      rel("orders", "sellerId", "userId"),
      rel("tradeOffers", "fromUserId", "toUserId"),
      rel("tradeOffers", "toUserId", "fromUserId"),
    ]);
    return results.some(Boolean);
  } catch (err) {
    console.error("mayNotify error:", err);
    return false;
  }
}
