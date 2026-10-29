import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const idToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const decoded = await adminAuth().verifyIdToken(idToken).catch(() => null);
    if (!decoded) return NextResponse.json({ error: "Сессия истекла. Войди заново." }, { status: 401 });

    const { code, action } = await req.json();
    if (typeof code !== "string" || !code) {
      return NextResponse.json({ error: "Не указан код" }, { status: 400 });
    }
    if (action !== "approve" && action !== "deny") {
      return NextResponse.json({ error: "Недопустимое действие" }, { status: 400 });
    }

    const db = adminDb();
    const ref = db.collection("deviceLogins").doc(code);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Заявка не найдена — возможно, срок её действия истёк" }, { status: 404 });
    }

    const request = snap.data() as { status: string; expiresAt: number };
    if (request.status !== "pending") {
      return NextResponse.json({ error: "Эта заявка уже обработана" }, { status: 400 });
    }
    if (Date.now() > request.expiresAt) {
      return NextResponse.json({ error: "Время на подтверждение истекло. Обнови QR-код и попробуй снова." }, { status: 400 });
    }

    if (action === "deny") {
      await ref.update({ status: "denied" });
      return NextResponse.json({ ok: true });
    }

    // Кастомный токен живёт максимум час и годится только на один вход — читает его только тот,
    // кто знает случайный 128-битный код заявки (см. src/lib/deviceLogin.ts).
    const token = await adminAuth().createCustomToken(decoded.uid);
    await ref.update({ status: "approved", token, approvedByUid: decoded.uid, approvedAt: Date.now() });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("device-login/confirm error:", err);
    return NextResponse.json({ error: "Не удалось подтвердить вход" }, { status: 500 });
  }
}
