import { NextRequest, NextResponse } from "next/server";
import { sendTelegramMessage } from "@/lib/telegramBot";
import { siteRow, ALLOWED_ADMIN_PATHS } from "@/lib/telegramAdminNotify";
import { requireUser } from "@/lib/requireUser";
import { rateLimit } from "@/lib/rateLimit";
import { stripLinks } from "@/lib/sanitizeText";

export const runtime = "nodejs";

const ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID ? Number(process.env.TELEGRAM_ADMIN_CHAT_ID) : null;

/** Сообщение админу в личку. Нужен вход в аккаунт + лимит частоты + без ссылок (раньше роут был
 * открыт всем, и админу можно было слать что угодно). */
export async function POST(req: NextRequest) {
  try {
    if (!ADMIN_CHAT_ID) return NextResponse.json({ ok: true, delivered: false });
    const caller = await requireUser(req);
    if (!caller) return NextResponse.json({ ok: false, error: "Не авторизован" }, { status: 401 });
    if (!(await rateLimit(`notify_admin_${caller}`, 15, 60_000))) {
      return NextResponse.json({ ok: false, error: "Слишком часто" }, { status: 429 });
    }

    const { text, path } = await req.json();
    if (typeof text !== "string" || !text) return NextResponse.json({ ok: false, error: "text обязателен" }, { status: 400 });

    const row = typeof path === "string" && ALLOWED_ADMIN_PATHS.includes(path) ? siteRow(path) : [];
    await sendTelegramMessage(ADMIN_CHAT_ID, stripLinks(text, 1000), row.length ? [row] : undefined);
    return NextResponse.json({ ok: true, delivered: true });
  } catch (err) {
    console.error("notify/admin error:", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
