import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebaseAdmin";
import { sendWebPush } from "@/lib/webPushServer";
import { rateLimit } from "@/lib/rateLimit";
import { isAdminUid } from "@/lib/adminGuard";
import { stripForeignLinks } from "@/lib/sanitizeNotify";

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
    const validCategory = category === "purchases" || category === "reminders" || category === "news" ? category : "messages";
    const admin = isAdminUid(decoded.uid);
    // Лимиты частоты (отправитель и получатель) и вырезание чужих ссылок из текста — как у Telegram-уведомлений.
    if (!admin) {
      if (!(await rateLimit(`push-from:${decoded.uid}`, 60, 60 * 60 * 1000))) return NextResponse.json({ error: "Слишком часто" }, { status: 429 });
      if (!(await rateLimit(`push-to:${uid}`, 40, 60 * 60 * 1000))) return NextResponse.json({ ok: true });
    }
    const clean = (t: string, max: number) => (admin ? t.slice(0, max) : stripForeignLinks(t.slice(0, max)));
    await sendWebPush(uid, { title: clean(title.trim(), 120), body: typeof body === "string" ? clean(body, 300) : "", url: typeof url === "string" ? url : undefined }, validCategory);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("notify/push error:", err);
    return NextResponse.json({ error: "Не удалось отправить" }, { status: 500 });
  }
}
