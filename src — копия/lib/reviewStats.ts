import { adminDb } from "./firebaseAdmin";

/**
 * Считает рейтинг продавца по РЕАЛЬНЫМ отзывам (коллекция reviews) и, если сохранённые в профиле
 * ratingSum/ratingCount разошлись с этим, исправляет их. Раньше счётчики увеличивались из браузера
 * покупателя (updateDoc чужого профиля с increment), а правила Firestore такую запись запрещают —
 * отзыв сохранялся, а счётчик у продавца почти не рос: на странице «Все отзывы» было 30, а в
 * рейтинге и на карточках — 4.
 */
export async function syncSellerRating(sellerId: string): Promise<{ ratingSum: number; ratingCount: number }> {
  const db = adminDb();
  const snap = await db.collection("reviews").where("sellerId", "==", sellerId).select("rating").get();
  let ratingSum = 0;
  let ratingCount = 0;
  snap.docs.forEach((d) => {
    const r = Number(d.data().rating);
    if (Number.isFinite(r)) {
      ratingSum += r;
      ratingCount++;
    }
  });

  const userRef = db.collection("users").doc(sellerId);
  const userSnap = await userRef.get();
  if (userSnap.exists) {
    const data = userSnap.data() as { ratingSum?: number; ratingCount?: number };
    if ((data.ratingSum ?? 0) !== ratingSum || (data.ratingCount ?? 0) !== ratingCount) {
      await userRef.update({ ratingSum, ratingCount });
    }
  }
  return { ratingSum, ratingCount };
}
