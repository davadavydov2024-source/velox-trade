import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { sendTelegramMessage } from "@/lib/telegramBot";
import { escapeHtml, previewText, toTelegramHtml } from "@/lib/chatFormat";

export const runtime = "nodejs";

/**
 * Шлёт уведомление в Telegram конкретному пользователю сайта — но только если он привязал
 * Telegram (см. /profile/appearance или /profile/security → "Привязать Telegram").
 * Если не привязан — просто молча ничего не делает, ошибки это не считается.
 */
export async function POST(req: NextRequest) {
  try {
    const { uid, text, chat } = await req.json();
    if (!uid || !text) {
      return NextResponse.json({ ok: false, error: "uid и text обязательны" }, { status: 400 });
    }

    const linkSnap = await adminDb().collection("telegramLinks").doc(uid).get();
    if (!linkSnap.exists) {
      return NextResponse.json({ ok: true, delivered: false });
    }
    const { chatId } = linkSnap.data() as { chatId: number };
    if (typeof chat === "string" && chat) {
      // Сообщение из чата: text — заголовок ("💬 Новое сообщение..."), chat — разметка самого сообщения.
      // Сервер сам превращает её в безопасный HTML (скрытое уходит как спойлер) — произвольный HTML
      // и ссылки с клиента принять нельзя.
      const html = `${escapeHtml(text)}\n${toTelegramHtml(chat, 200)}`;
      const sent = await sendTelegramMessage(chatId, html, undefined, "HTML");
      // Если Telegram не принял разметку — шлём обычным текстом, где скрытое заменено на ▒▒▒▒.
      if (sent === null) await sendTelegramMessage(chatId, `${text}\n${previewText(chat, 200)}`);
    } else {
      await sendTelegramMessage(chatId, text);
    }

    return NextResponse.json({ ok: true, delivered: true });
  } catch (err) {
    console.error("notify/telegram error:", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
