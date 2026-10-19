import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebaseAdmin";
import { sendWebPush } from "@/lib/webPushServer";
import { rateLimit } from "@/lib/apiRateLimit";
import { mayNotify } from "@/lib/notifyAccess";

export const runtime = "nodejs";

/**
 * Шлёт push-уведомление в браузер пользователя — но только если он разрешил уведомления
 * и подписался (см. переключатель в /profile/security). Если не подписан — молча ничего
 * не делает, это не ошибка.
 */
export async function POST(req: NextRequest) {
  try {
    // Раньше роут был открыт всем: любой мог отправить push любому пользователю с любым текстом
    // (спам и фишинг от имени сайта). Теперь нужен вход в аккаунт; ссылка — только на наш сайт
    // (см. toAbsoluteLink в webPushServer), длина текста ограничена.
    const authHeader = req.headers.get("authorization");
    const idToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    const decoded = await adminAuth().verifyIdToken(idToken).catch(() => null);
    if (!decoded) return NextResponse.json({ error: "Сессия истекла" }, { status: 401 });

    const { uid, title, body, url, category } = await req.json();
    if (typeof uid !== "string" || !uid || typeof title !== "string" || !title.trim()) {
      return NextResponse.json({ error: "uid и title обязательны" }, { status: 400 });
    }
    if (!(await rateLimit(`notify_push_${decoded.uid}`, 60, 60_000))) return NextResponse.json({ error: "Слишком часто" }, { status: 429 });
    if (!(await mayNotify(decoded.uid, uid))) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    const validCategory = category === "purchases" || category === "reminders" || category === "news" ? category : "messages";
    await sendWebPush(uid, { title: title.trim().slice(0, 120), body: typeof body === "string" ? body.slice(0, 300) : "", url: typeof url === "string" ? url : undefined }, validCategory);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("notify/push error:", err);
    return NextResponse.json({ error: "Не удалось отправить" }, { status: 500 });
  }
}
