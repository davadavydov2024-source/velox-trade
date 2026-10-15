import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebaseAdmin";
import { sendWebPushDetailed } from "@/lib/webPushServer";

export const runtime = "nodejs";

/** Тестовый push самому себе: возвращает, на сколько устройств ушло и какие ошибки вернул FCM. */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const idToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    const decoded = await adminAuth().verifyIdToken(idToken).catch(() => null);
    if (!decoded) return NextResponse.json({ error: "Сессия истекла" }, { status: 401 });

    const { endpoint } = (await req.json().catch(() => ({}))) as { endpoint?: string };
    const report = await sendWebPushDetailed(
      decoded.uid,
      {
        title: "Тестовое уведомление",
        body: "Если ты это видишь — push-уведомления работают 🎉",
        url: "/profile/security",
      },
      typeof endpoint === "string" ? endpoint : undefined
    );
    return NextResponse.json(report);
  } catch (err: any) {
    console.error("push/test error:", err);
    return NextResponse.json({ error: "Не удалось отправить тест", detail: String(err?.message || err).slice(0, 200) }, { status: 500 });
  }
}
