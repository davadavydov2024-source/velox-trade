import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { sendTelegramMessage, sendTelegramPhoto } from "@/lib/telegramBot";

export const runtime = "nodejs";

function isAdminUid(uid: string): boolean {
  const list = (process.env.NEXT_PUBLIC_ADMIN_UIDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return list.includes(uid);
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const idToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const auth = adminAuth();
    let uid: string;
    try {
      const decoded = await auth.verifyIdToken(idToken);
      uid = decoded.uid;
    } catch {
      return NextResponse.json({ error: "Недействительный токен" }, { status: 401 });
    }

    if (!isAdminUid(uid)) {
      return NextResponse.json({ error: "Доступ только для администраторов" }, { status: 403 });
    }

    const { text, photoUrl, buttonText, buttonLink } = await req.json();
    if (!text || typeof text !== "string" || !text.trim()) {
      return NextResponse.json({ error: "Текст сообщения пуст" }, { status: 400 });
    }

    const buttons = buttonText && buttonLink ? [[{ text: buttonText, url: buttonLink }]] : undefined;

    const db = adminDb();
    const linksSnap = await db.collection("telegramLinks").get();

    let sent = 0;
    let failed = 0;
    for (const linkDoc of linksSnap.docs) {
      const { chatId } = linkDoc.data() as { chatId: number };
      const ok = photoUrl
        ? await sendTelegramPhoto(chatId, photoUrl, text, buttons)
        : await sendTelegramMessage(chatId, text, buttons);
      if (ok) sent++;
      else failed++;
      // небольшая пауза, чтобы не упереться в лимит запросов Telegram Bot API
      await new Promise((r) => setTimeout(r, 60));
    }

    return NextResponse.json({ ok: true, total: linksSnap.size, sent, failed });
  } catch (err) {
    console.error("telegram-broadcast error:", err);
    return NextResponse.json({ error: "Не удалось выполнить рассылку" }, { status: 500 });
  }
}
