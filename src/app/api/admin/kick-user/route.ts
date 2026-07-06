import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

function isAdminUid(uid: string): boolean {
  const list = (process.env.NEXT_PUBLIC_ADMIN_UIDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return list.includes(uid);
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const idToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const auth = adminAuth();
    let callerUid: string;
    try {
      callerUid = (await auth.verifyIdToken(idToken)).uid;
    } catch {
      return NextResponse.json({ error: "Недействительный токен" }, { status: 401 });
    }
    if (!isAdminUid(callerUid)) {
      return NextResponse.json({ error: "Доступ только для администраторов" }, { status: 403 });
    }

    const { targetUid } = await req.json();
    if (!targetUid || typeof targetUid !== "string") {
      return NextResponse.json({ error: "Не указан пользователь" }, { status: 400 });
    }

    // Реально разрывает текущую сессию — при следующей проверке токена Firebase потребует
    // повторный вход. В паре с обновлением forceReloadAt это происходит для пользователя немедленно,
    // а не через час, когда истёк бы токен сам по себе.
    await auth.revokeRefreshTokens(targetUid);
    await adminDb().collection("users").doc(targetUid).update({ forceReloadAt: Date.now() });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("kick-user error:", err);
    return NextResponse.json({ error: "Не удалось выполнить действие" }, { status: 500 });
  }
}
