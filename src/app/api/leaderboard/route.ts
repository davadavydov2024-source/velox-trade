import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

const MIN_RATINGS = 3; // отсекаем продавцов с 1-2 случайными отзывами — нечестно ставить их в топ

export async function GET() {
  try {
    // Читаем только тех, у кого вообще есть отзывы (иначе пришлось бы читать всю таблицу users) —
    // ratingCount растёт только когда покупатель реально оставил отзыв продавцу.
    const snap = await adminDb()
      .collection("users")
      .orderBy("ratingCount", "desc")
      .limit(100)
      .get();

    const sellers = snap.docs
      .map((d) => {
        const data = d.data() as Record<string, unknown>;
        const ratingCount = (data.ratingCount as number) ?? 0;
        const ratingSum = (data.ratingSum as number) ?? 0;
        return {
          uid: d.id,
          displayName: data.displayName as string,
          username: (data.username as string | null) ?? null,
          photoURL: (data.photoURL as string | null) ?? null,
          badges: (data.badges as string[]) ?? [],
          ratingCount,
          avgRating: ratingCount ? ratingSum / ratingCount : 0,
        };
      })
      .filter((s) => s.ratingCount >= MIN_RATINGS && !!s.username)
      .sort((a, b) => b.avgRating - a.avgRating || b.ratingCount - a.ratingCount)
      .slice(0, 10);

    return NextResponse.json({ sellers });
  } catch (err) {
    console.error("leaderboard error:", err);
    return NextResponse.json({ error: "Не удалось загрузить рейтинг" }, { status: 500 });
  }
}
