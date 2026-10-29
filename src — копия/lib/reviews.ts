import { collection, doc, getDoc, getDocs, query, where, addDoc, updateDoc } from "firebase/firestore";
import { db, auth } from "./firebase";
import { Review } from "@/types";
import { sendOrderChatMessage } from "./orderChats";
import { notifyTelegram } from "./telegramNotify";

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
  // Рейтинг продавца пересчитывает СЕРВЕР по реальным отзывам. Раньше счётчики увеличивались
  // отсюда прямой записью в чужой профиль — правила Firestore её не пропускали, и счётчик отставал
  // от числа отзывов (30 отзывов, а в рейтинге — 4).
  try {
    const idToken = await auth.currentUser?.getIdToken();
    if (idToken) {
      await fetch("/api/reviews/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ sellerId: data.sellerId }),
      });
    }
  } catch {
    // не критично: рейтинг всё равно исправится при следующем просмотре профиля продавца
  }

  const order = orderSnap.data() as { userId: string; sellerId: string };
  const stars = "⭐".repeat(data.rating);
  await sendOrderChatMessage(
    data.orderId,
    order.userId,
    order.sellerId,
    "system",
    `${stars} ${data.buyerName} оставил(а) отзыв${data.text ? `: «${data.text}»` : "."}`
  );
  notifyTelegram(data.sellerId, `${stars} Новый отзыв от покупателя${data.text ? `: «${data.text}»` : ""}`);
}

export async function getSellerReviews(sellerId: string): Promise<Review[]> {
  // Без orderBy: where + orderBy на разных полях требует составного индекса в Firestore.
  // Сортируем на клиенте, чтобы не заставлять админа вручную создавать индекс в консоли.
  const snap = await getDocs(query(reviewsCol, where("sellerId", "==", sellerId)));
  const reviews = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Review);
  return reviews.sort((a, b) => b.createdAt - a.createdAt);
}
