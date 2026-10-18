import { NextRequest, NextResponse } from "next/server";
import { sendTelegramMessage } from "@/lib/telegramBot";
import { requireUser } from "@/lib/adminGuard";
import { rateLimit } from "@/lib/rateLimit";
import { cleanPlainText } from "@/lib/sanitizeNotify";

export const runtime = "nodejs";

const ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID ? Number(process.env.TELEGRAM_ADMIN_CHAT_ID) : null;

/** Шлёт сообщение в личку админа (новые пользователи, заявки). Только для вошедших, с лимитом частоты. */
export async function POST(req: NextRequest) {
  try {
    const guard = await requireUser(req);
    if ("error" in guard) return guard.error;
    if (!ADMIN_CHAT_ID) return NextResponse.json({ ok: true, delivered: false });

    const { text } = await req.json().catch(() => ({}));
    const clean = cleanPlainText(text, 500, guard.isAdmin);
    if (!clean) return NextResponse.json({ ok: false, error: "text обязателен" }, { status: 400 });

    if (!guard.isAdmin && !(await rateLimit(`tg-admin:${guard.uid}`, 20, 60 * 60 * 1000))) {
      return NextResponse.json({ ok: true, delivered: false });
    }

    await sendTelegramMessage(ADMIN_CHAT_ID, clean);
    return NextResponse.json({ ok: true, delivered: true });
  } catch (err) {
    console.error("notify/admin error:", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
