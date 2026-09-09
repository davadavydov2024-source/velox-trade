import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const idToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const decoded = await adminAuth().verifyIdToken(idToken).catch(() => null);
    if (!decoded) return NextResponse.json({ error: "Сессия истекла" }, { status: 401 });
    const uid = decoded.uid;

    const { eventId } = await req.json();
    if (!eventId) return NextResponse.json({ error: "eventId обязателен" }, { status: 400 });

    const db = adminDb();
    const eventRef = db.collection("events").doc(eventId);
    const userRef = db.collection("users").doc(uid);

    const bonus = await db.runTransaction(async (tx) => {
      const [eventSnap, userSnap] = await Promise.all([tx.get(eventRef), tx.get(userRef)]);
      if (!eventSnap.exists) throw new Error("event-not-found");
      const event = eventSnap.data() as { active: boolean; bonusRub: number };
      if (!event.active) throw new Error("event-inactive");

      if (!userSnap.exists) throw new Error("user-not-found");
      const claimed: string[] = userSnap.data()?.claimedEventIds ?? [];
      if (claimed.includes(eventId)) throw new Error("already-claimed");

      tx.update(userRef, {
        balance: FieldValue.increment(event.bonusRub),
        claimedEventIds: FieldValue.arrayUnion(eventId),
      });
      return event.bonusRub;
    });

    return NextResponse.json({ ok: true, bonus });
  } catch (err: any) {
    const map: Record<string, string> = {
      "event-not-found": "Ивент не найден",
      "event-inactive": "Ивент сейчас не активен",
      "user-not-found": "Профиль не найден",
      "already-claimed": "Бонус за этот ивент уже получен",
    };
    const message = map[err?.message] ?? "Не удалось начислить бонус";
    const status = err?.message === "already-claimed" ? 400 : err?.message ? 400 : 500;
    if (!map[err?.message]) console.error("events/claim error:", err);
    return NextResponse.json({ error: message }, { status });
  }
}
