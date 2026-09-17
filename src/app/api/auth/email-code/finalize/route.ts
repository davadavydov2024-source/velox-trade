import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VERIFIED_WINDOW_MS = 30 * 60 * 1000; // код должен быть подтверждён не более получаса назад

/**
 * Шаг 3, последний: вызывается сразу после того, как клиент создал аккаунт в Firebase Auth
 * (createUserWithEmailAndPassword). Проверяем, что ИМЕННО ДЛЯ ЭТОГО email код был подтверждён
 * недавно (см. /api/auth/email-code/confirm), и если да — ставим emailVerified:true через Admin
 * SDK напрямую, без стандартного письма-ссылки от Firebase (наш код уже доказал владение почтой).
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const idToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    const decoded = await adminAuth().verifyIdToken(idToken).catch(() => null);
    if (!decoded?.email) return NextResponse.json({ error: "Сессия истекла" }, { status: 401 });

    const normalized = decoded.email.trim().toLowerCase();
    const db = adminDb();
    const ref = db.collection("emailVerificationCodes").doc(normalized);
    const snap = await ref.get();
    const data = snap.exists ? (snap.data() as { verified?: boolean; verifiedAt?: number }) : null;

    if (!data?.verified || !data.verifiedAt || Date.now() - data.verifiedAt > VERIFIED_WINDOW_MS) {
      return NextResponse.json({ error: "Почта не подтверждена кодом — пройди регистрацию заново" }, { status: 400 });
    }

    await adminAuth().updateUser(decoded.uid, { emailVerified: true });
    await ref.delete();

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("auth/email-code/finalize error:", err);
    return NextResponse.json({ error: "Не удалось завершить подтверждение" }, { status: 500 });
  }
}
