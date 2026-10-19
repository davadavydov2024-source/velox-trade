import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { syncSellerRating } from "@/lib/reviewStats";

export const runtime = "nodejs";
// Роут читает query-параметры через nextUrl.searchParams — без этого Next пробует пререндерить
// его статически при билде и падает с "Dynamic server usage" (см. лог деплоя на Vercel).
export const dynamic = "force-dynamic";

const ONLINE_THRESHOLD_MS = 2 * 60 * 1000; // 2 минуты без "пинга" — считаем офлайн

export async function GET(req: NextRequest) {
  try {
    const uid = req.nextUrl.searchParams.get("uid");
    if (!uid) return NextResponse.json({ error: "uid обязателен" }, { status: 400 });

    if (uid === "store") {
      return NextResponse.json({ profile: null });
    }

    const snap = await adminDb().collection("users").doc(uid).get();
    if (!snap.exists) return NextResponse.json({ profile: null });

    const data = snap.data() as Record<string, unknown>;
    // Приватность: пользователь может скрыть «в сети» и время последней активности (Безопасность → Конфиденциальность).
    const hideOnline = (data.privacy as { hideOnline?: boolean } | undefined)?.hideOnline === true;
    const lastActiveAt = hideOnline ? 0 : ((data.lastActiveAt as number) ?? 0);

    // Рейтинг берём из реальных отзывов (и заодно чиним расхождение в профиле), а не из сохранённых
    // счётчиков — они могли отстать от числа отзывов. Сбой подсчёта не должен ломать профиль.
    let ratingSum = (data.ratingSum as number) ?? 0;
    let ratingCount = (data.ratingCount as number) ?? 0;
    try {
      ({ ratingSum, ratingCount } = await syncSellerRating(uid));
    } catch (err) {
      console.error("public-profile: syncSellerRating failed", err);
    }

    return NextResponse.json({
      profile: {
        uid,
        displayName: data.displayName,
        username: data.username ?? null,
        bio: data.bio ?? "",
        photoURL: data.photoURL ?? null,
        badges: data.badges ?? [],
        ratingSum,
        ratingCount,
        createdAt: data.createdAt ?? null,
        isOnline: Date.now() - lastActiveAt < ONLINE_THRESHOLD_MS,
        nameColor: data.nameColor ?? undefined,
        nameFont: data.nameFont ?? undefined,
        bannerURL: data.bannerURL ?? null,
      },
    });
  } catch (err) {
    console.error("public-profile error:", err);
    return NextResponse.json({ error: "Не удалось загрузить профиль" }, { status: 500 });
  }
}
