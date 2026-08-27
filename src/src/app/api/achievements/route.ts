import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { ACHIEVEMENTS, AchievementStatKey } from "@/lib/achievements";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const idToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const decoded = await adminAuth().verifyIdToken(idToken).catch(() => null);
    if (!decoded) return NextResponse.json({ error: "Сессия истекла" }, { status: 401 });
    const uid = decoded.uid;

    const db = adminDb();
    const userRef = db.collection("users").doc(uid);
    const userSnap = await userRef.get();
    if (!userSnap.exists) return NextResponse.json({ error: "Профиль не найден" }, { status: 404 });
    const user = userSnap.data() as {
      createdAt: number;
      emailVerified?: boolean;
      ratingCount?: number;
      wheelSpinsCount?: number;
      unlockedAchievements?: string[];
      twoFactorEnabled?: boolean;
      photoURL?: string | null;
      bio?: string;
      claimedEventIds?: string[];
    };

    // count() — агрегирующий запрос, не читает сами документы (дёшево даже при большом числе заказов).
    const [buyerOrdersCount, sellerOrdersCount, referralsCount] = await Promise.all([
      db.collection("orders").where("userId", "==", uid).where("status", "==", "confirmed").count().get(),
      db.collection("orders").where("sellerId", "==", uid).where("status", "==", "confirmed").count().get(),
      db.collection("users").where("referredBy", "==", uid).count().get(),
    ]);

    const stats: Record<AchievementStatKey, number> = {
      buyerConfirmedOrders: buyerOrdersCount.data().count,
      sellerConfirmedOrders: sellerOrdersCount.data().count,
      wheelSpins: user.wheelSpinsCount ?? 0,
      referrals: referralsCount.data().count,
      accountAgeDays: Math.floor((Date.now() - (user.createdAt ?? Date.now())) / 86_400_000),
      emailVerified: user.emailVerified ? 1 : 0,
      ratingCount: user.ratingCount ?? 0,
      twoFactorEnabled: user.twoFactorEnabled ? 1 : 0,
      profileComplete: user.photoURL && user.bio?.trim() ? 1 : 0,
      eventsParticipated: user.claimedEventIds?.length ?? 0,
    };

    const alreadyUnlocked = new Set(user.unlockedAchievements ?? []);
    const newlyUnlocked: string[] = [];

    // Достижения престижные, без денег — просто фиксируем факт разблокировки (для значка
    // в профиле и чтобы не показывать один и тот же "новый" тост повторно при каждом визите).
    const results = ACHIEVEMENTS.map((def) => {
      const value = stats[def.statKey];
      const unlocked = value >= def.threshold;
      if (unlocked && !alreadyUnlocked.has(def.id)) newlyUnlocked.push(def.id);
      return {
        id: def.id,
        progress: Math.min(value, def.threshold),
        threshold: def.threshold,
        unlocked,
        justUnlocked: unlocked && !alreadyUnlocked.has(def.id),
      };
    });

    if (newlyUnlocked.length > 0) {
      await userRef.update({ unlockedAchievements: FieldValue.arrayUnion(...newlyUnlocked) });
    }

    return NextResponse.json({ results });
  } catch (err) {
    console.error("achievements GET error:", err);
    return NextResponse.json({ error: "Не удалось загрузить достижения" }, { status: 500 });
  }
}
