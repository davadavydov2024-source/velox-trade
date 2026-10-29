import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VERIFIED_WINDOW_MS = 30 * 60 * 1000;

/**
 * Шаг 3: вызывается сразу после создания аккаунта в Firebase Auth. Проверяем, что для ЭТОГО email
 * код из Telegram был подтверждён недавно, и привязываем этот же Telegram к новому аккаунту
 * (telegramLinks) — так бот подключён автоматически, а уведомления и вход по коду работают сразу.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const idToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    const decoded = await adminAuth().verifyIdToken(idToken).catch(() => null);
    if (!decoded?.email) return NextResponse.json({ error: "Сессия истекла" }, { status: 401 });

    const { token } = await req.json();
    if (typeof token !== "string" || !token) return NextResponse.json({ error: "Нет токена подтверждения" }, { status: 400 });

    const db = adminDb();
    const ref = db.collection("tgVerifyRequests").doc(token);
    const snap = await ref.get();
    const data = snap.exists
      ? (snap.data() as { email: string; status: string; verifiedAt?: number; chatId?: number; telegramUsername?: string | null })
      : null;

    if (
      !data ||
      data.status !== "verified" ||
      !data.verifiedAt ||
      Date.now() - data.verifiedAt > VERIFIED_WINDOW_MS ||
      data.email !== decoded.email.trim().toLowerCase() ||
      typeof data.chatId !== "number"
    ) {
      return NextResponse.json({ error: "Telegram не подтверждён — пройди регистрацию заново" }, { status: 400 });
    }

    await db.collection("telegramLinks").doc(decoded.uid).set({
      chatId: data.chatId,
      telegramUsername: data.telegramUsername ?? null,
      linkedAt: Date.now(),
    });
    await ref.delete();
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("tg-verify/finalize error:", err);
    return NextResponse.json({ error: "Не удалось завершить подтверждение" }, { status: 500 });
  }
}
