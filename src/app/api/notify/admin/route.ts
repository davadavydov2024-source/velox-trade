import { NextRequest, NextResponse } from "next/server";
import { sendTelegramMessage } from "@/lib/telegramBot";

export const runtime = "nodejs";

const ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID ? Number(process.env.TELEGRAM_ADMIN_CHAT_ID) : null;

/** Шлёт сообщение прямо в личку админа (TELEGRAM_ADMIN_CHAT_ID) — для новых пользователей,
 * новых заявок и т.п., которые админ должен увидеть проактивно, а не только зайдя в /admin. */
export async function POST(req: NextRequest) {
  try {
    if (!ADMIN_CHAT_ID) return NextResponse.json({ ok: true, delivered: false });

    const { text } = await req.json();
    if (!text) return NextResponse.json({ ok: false, error: "text обязателен" }, { status: 400 });

    await sendTelegramMessage(ADMIN_CHAT_ID, text);
    return NextResponse.json({ ok: true, delivered: true });
  } catch (err) {
    console.error("notify/admin error:", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
