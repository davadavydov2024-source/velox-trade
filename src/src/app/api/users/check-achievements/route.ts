import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";

export const runtime = "nodejs";

/**
 * Правила Firestore намеренно запрещают пользователю менять свои badges напрямую с клиента
 * (иначе можно было бы самому выдать себе VIP). Поэтому автоматическая выдача достижений
 * идёт только отсюда — через Admin SDK, который правила не проверяет.
 */
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
    const userSnap = await userRef.get();
    if (!userSnap.exists) return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });

    const badges: string[] = userSnap.data()?.badges ?? [];
    if (badges.includes("buyer")) {
      return NextResponse.json({ awarded: [] });
    }

    const confirmedSnap = await db
      .collection("orders")
      .where("userId", "==", uid)
      .where("status", "==", "confirmed")
      .limit(1)
      .get();

    if (confirmedSnap.empty) {
      return NextResponse.json({ awarded: [] });
    }

    await userRef.update({ badges: FieldValue.arrayUnion("buyer") });
    return NextResponse.json({ awarded: ["buyer"] });
  } catch (err) {
    console.error("check-achievements error:", err);
    return NextResponse.json({ error: "Не удалось проверить достижения" }, { status: 500 });
  }
}
