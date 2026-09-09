import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { sendTelegramMessage } from "@/lib/telegramBot";

export const runtime = "nodejs";

/**
 * Шлёт уведомление в Telegram конкретному пользователю сайта — но только если он привязал
 * Telegram (см. /profile/appearance или /profile/security → "Привязать Telegram").
 * Если не привязан — просто молча ничего не делает, ошибки это не считается.
 */
export async function POST(req: NextRequest) {
  try {
    const { uid, text } = await req.json();
    if (!uid || !text) {
      return NextResponse.json({ ok: false, error: "uid и text обязательны" }, { status: 400 });
    }

    const linkSnap = await adminDb().collection("telegramLinks").doc(uid).get();
    if (!linkSnap.exists) {
      return NextResponse.json({ ok: true, delivered: false });
    }
    const { chatId } = linkSnap.data() as { chatId: number };
    await sendTelegramMessage(chatId, text);

    return NextResponse.json({ ok: true, delivered: true });
  } catch (err) {
    console.error("notify/telegram error:", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
