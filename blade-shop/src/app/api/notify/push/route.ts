import { NextRequest, NextResponse } from "next/server";
import { sendWebPush } from "@/lib/webPushServer";

export const runtime = "nodejs";

/**
 * Шлёт push-уведомление в браузер пользователя — но только если он разрешил уведомления
 * и подписался (см. переключатель в /profile/security). Если не подписан — молча ничего
 * не делает, это не ошибка.
 */
export async function POST(req: NextRequest) {
  try {
    const { uid, title, body, url } = await req.json();
    if (!uid || !title) return NextResponse.json({ error: "uid и title обязательны" }, { status: 400 });
    await sendWebPush(uid, { title, body: body ?? "", url });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("notify/push error:", err);
    return NextResponse.json({ error: "Не удалось отправить" }, { status: 500 });
  }
}
