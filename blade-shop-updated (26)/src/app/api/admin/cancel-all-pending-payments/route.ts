import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { cactusGetPayment } from "@/lib/cactuspay";
import { FieldValue } from "firebase-admin/firestore";

export const runtime = "nodejs";

function isAdminUid(uid: string): boolean {
  const list = (process.env.NEXT_PUBLIC_ADMIN_UIDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return list.includes(uid);
}

/**
 * Разовое админское действие: отменяет ВСЕ платежи со статусом "pending" по всем пользователям,
 * прямо сейчас, независимо от их возраста. Перед отменой каждый платёж перепроверяется у самого
 * CactusPay — если окажется, что оплата всё-таки прошла, баланс зачисляется, а не отменяется.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const idToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const auth = adminAuth();
    let uid: string;
    try {
      uid = (await auth.verifyIdToken(idToken)).uid;
    } catch {
      return NextResponse.json({ error: "Недействительный токен" }, { status: 401 });
    }
    if (!isAdminUid(uid)) {
      return NextResponse.json({ error: "Доступ только для администраторов" }, { status: 403 });
    }

    const db = adminDb();
    const snap = await db.collection("payments").where("status", "==", "pending").get();

    let cancelled = 0;
    let credited = 0;
    let failed = 0;

    for (const docSnap of snap.docs) {
      try {
        const verified = await cactusGetPayment(docSnap.id);
        if (verified.status === "ACCEPT") {
          await db.runTransaction(async (tx) => {
            const freshSnap = await tx.get(docSnap.ref);
            const fresh = freshSnap.data() as { status: string; userId: string; amount: number };
            if (fresh.status === "paid") return;
            tx.update(docSnap.ref, { status: "paid", paidAt: Date.now(), cactusPaymentId: verified.id });
            tx.update(db.collection("users").doc(fresh.userId), { balance: FieldValue.increment(fresh.amount) });
          });
          credited++;
        } else {
          await docSnap.ref.update({ status: "cancelled", cancelledAt: Date.now(), cancelReason: "admin_bulk" });
          cancelled++;
        }
      } catch (err) {
        console.error(`cancel-all-pending-payments: платёж ${docSnap.id} —`, err);
        failed++;
      }
    }

    return NextResponse.json({ ok: true, total: snap.size, cancelled, credited, failed });
  } catch (err) {
    console.error("cancel-all-pending-payments error:", err);
    return NextResponse.json({ error: "Не удалось выполнить массовую отмену" }, { status: 500 });
  }
}
