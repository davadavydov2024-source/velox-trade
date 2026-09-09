import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

// Как в Telegram: свежая (< 25 часов) сессия не может выгонять другие — так угонщик аккаунта
// не может сразу же выкинуть настоящего владельца из его собственных сессий.
const TRUST_MS = 25 * 60 * 60 * 1000;

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const idToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    let uid: string;
    try {
      uid = (await adminAuth().verifyIdToken(idToken)).uid;
    } catch {
      return NextResponse.json({ error: "Недействительный токен" }, { status: 401 });
    }

    const { currentDeviceId, targetDeviceId } = await req.json();
    if (!currentDeviceId || !targetDeviceId || typeof targetDeviceId !== "string") {
      return NextResponse.json({ error: "Не указано устройство" }, { status: 400 });
    }

    const db = adminDb();
    const currentRef = db.collection("sessions").doc(`${uid}_${currentDeviceId}`);
    const currentSnap = await currentRef.get();
    if (!currentSnap.exists || currentSnap.data()?.revoked) {
      return NextResponse.json({ error: "Текущая сессия не найдена — перезайди в аккаунт" }, { status: 404 });
    }

    const createdAt = currentSnap.data()?.createdAt as number;
    const elapsed = Date.now() - createdAt;
    if (elapsed < TRUST_MS) {
      const hoursLeft = Math.ceil((TRUST_MS - elapsed) / (60 * 60 * 1000));
      return NextResponse.json(
        {
          error: `Управление сессиями станет доступно через ${hoursLeft} ч. — с этого устройства вы вошли недавно (защита от угона аккаунта, как в Telegram).`,
        },
        { status: 403 }
      );
    }

    const now = Date.now();

    if (targetDeviceId === "all") {
      const snap = await db.collection("sessions").where("uid", "==", uid).get();
      const batch = db.batch();
      snap.docs.forEach((d) => {
        if (d.id === currentRef.id) return;
        if (d.data().revoked) return;
        batch.update(d.ref, { revoked: true, revokedAt: now });
      });
      await batch.commit();
      return NextResponse.json({ ok: true });
    }

    if (targetDeviceId === currentDeviceId) {
      return NextResponse.json(
        { error: "Нельзя завершить текущую сессию так — используй обычный выход из аккаунта" },
        { status: 400 }
      );
    }

    const targetRef = db.collection("sessions").doc(`${uid}_${targetDeviceId}`);
    const targetSnap = await targetRef.get();
    if (!targetSnap.exists || targetSnap.data()?.uid !== uid) {
      return NextResponse.json({ error: "Сессия не найдена" }, { status: 404 });
    }
    await targetRef.update({ revoked: true, revokedAt: now });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("sessions/terminate error:", err);
    return NextResponse.json({ error: "Не удалось выполнить действие" }, { status: 500 });
  }
}
