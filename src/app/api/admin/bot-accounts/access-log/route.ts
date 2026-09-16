import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { isAdminUid } from "@/lib/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Кто и когда смотрел пароль/2FA-код конкретного бота — полная прозрачность на случай нескольких админов. */
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const idToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    const decoded = await adminAuth().verifyIdToken(idToken).catch(() => null);
    if (!decoded || !isAdminUid(decoded.uid)) return NextResponse.json({ error: "Доступ только для админов" }, { status: 403 });

    const botId = req.nextUrl.searchParams.get("botId");
    if (!botId) return NextResponse.json({ error: "Не указан бот" }, { status: 400 });

    const snap = await adminDb().collection("botCredentialAccessLog").where("botId", "==", botId).orderBy("at", "desc").limit(50).get();
    const logs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    return NextResponse.json({ logs });
  } catch (err) {
    console.error("admin/bot-accounts/access-log error:", err);
    return NextResponse.json({ error: "Не удалось загрузить лог" }, { status: 500 });
  }
}
