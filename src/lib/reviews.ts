import { collection, doc, getDoc, getDocs, query, where, addDoc, updateDoc, increment } from "firebase/firestore";
import { db } from "./firebase";
import { Review } from "@/types";

const reviewsCol = collection(db, "reviews");

export async function createReview(data: Omit<Review, "id" | "createdAt">) {
  const orderRef = doc(db, "orders", data.orderId);
  const orderSnap = await getDoc(orderRef);
  if (!orderSnap.exists() || orderSnap.data().status !== "confirmed") {
    throw new Error("order-not-confirmed");
  }
  if (orderSnap.data().reviewSubmitted) {
    throw new Error("review-already-submitted");
  }

  await addDoc(reviewsCol, { ...data, createdAt: Date.now() });
  await updateDoc(orderRef, { reviewSubmitted: true });
  await updateDoc(doc(db, "users", data.sellerId), {
    ratingSum: increment(data.rating),
    ratingCount: increment(1),
  });
}

export async function getSellerReviews(sellerId: string): Promise<Review[]> {
  // Без orderBy: where + orderBy на разных полях требует составного индекса в Firestore.
  // Сортируем на клиенте, чтобы не заставлять админа вручную создавать индекс в консоли.
  const snap = await getDocs(query(reviewsCol, where("sellerId", "==", sellerId)));
  const reviews = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Review);
  return reviews.sort((a, b) => b.createdAt - a.createdAt);
}
