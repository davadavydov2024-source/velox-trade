import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

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
    const lastActiveAt = (data.lastActiveAt as number) ?? 0;

    return NextResponse.json({
      profile: {
        uid,
        displayName: data.displayName,
        username: data.username ?? null,
        bio: data.bio ?? "",
        photoURL: data.photoURL ?? null,
        badges: data.badges ?? [],
        ratingSum: data.ratingSum ?? 0,
        ratingCount: data.ratingCount ?? 0,
        createdAt: data.createdAt ?? null,
        isOnline: Date.now() - lastActiveAt < ONLINE_THRESHOLD_MS,
        lastActiveAt: lastActiveAt || null,
      },
    });
  } catch (err) {
    console.error("public-profile error:", err);
    return NextResponse.json({ error: "Не удалось загрузить профиль" }, { status: 500 });
  }
}
