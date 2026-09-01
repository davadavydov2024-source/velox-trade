import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { dailyBonusAmount } from "@/types";

export const runtime = "nodejs";

function isSameCalendarDay(a: number, b: number): boolean {
  const da = new Date(a);
  const dbb = new Date(b);
  return da.getFullYear() === dbb.getFullYear() && da.getMonth() === dbb.getMonth() && da.getDate() === dbb.getDate();
}

function isYesterday(prev: number, now: number): boolean {
  const oneDayMs = 24 * 60 * 60 * 1000;
  // Сравниваем календарные дни, а не ровно 24 часа — иначе зайти в 23:59 и в 00:01 следующего дня
  // (2 минуты спустя) уже не считалось бы "на следующий день", хотя по ощущениям пользователя
  // это два разных дня захода.
  const prevDay = new Date(prev);
  const nowDay = new Date(now);
  const prevMidnight = new Date(prevDay.getFullYear(), prevDay.getMonth(), prevDay.getDate()).getTime();
  const nowMidnight = new Date(nowDay.getFullYear(), nowDay.getMonth(), nowDay.getDate()).getTime();
  return nowMidnight - prevMidnight === oneDayMs;
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const idToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const decoded = await adminAuth().verifyIdToken(idToken).catch(() => null);
    if (!decoded) return NextResponse.json({ error: "Сессия истекла" }, { status: 401 });
    const uid = decoded.uid;

    const db = adminDb();
    const userRef = db.collection("users").doc(uid);

    const result = await db.runTransaction(async (tx) => {
      const userSnap = await tx.get(userRef);
      if (!userSnap.exists) throw new Error("no-profile");
      const user = userSnap.data()!;
      const now = Date.now();

      if (user.lastDailyClaimAt && isSameCalendarDay(user.lastDailyClaimAt, now)) {
        throw new Error("already-claimed");
      }

      const prevStreak = (user.dailyStreak as number) ?? 0;
      const streak = user.lastDailyClaimAt && isYesterday(user.lastDailyClaimAt, now) ? prevStreak + 1 : 1;
      const amount = dailyBonusAmount(streak);

      tx.update(userRef, {
        balance: FieldValue.increment(amount),
        dailyStreak: streak,
        lastDailyClaimAt: now,
      });

      return { amount, streak };
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err: any) {
    if (err?.message === "already-claimed") return NextResponse.json({ error: "Бонус уже забран сегодня" }, { status: 400 });
    if (err?.message === "no-profile") return NextResponse.json({ error: "Профиль не найден" }, { status: 404 });
    console.error("daily-bonus error:", err);
    return NextResponse.json({ error: "Не удалось начислить бонус" }, { status: 500 });
  }
}
