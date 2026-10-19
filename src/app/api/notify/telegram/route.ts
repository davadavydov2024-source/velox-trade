import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { sendTelegramMessage } from "@/lib/telegramBot";
import { escapeHtml, previewText, toTelegramHtml } from "@/lib/chatFormat";
import { requireUser } from "@/lib/requireUser";
import { rateLimit } from "@/lib/apiRateLimit";
import { mayNotify } from "@/lib/notifyAccess";
import { stripLinks } from "@/lib/sanitizeText";
import { maskSecrets } from "@/lib/chatSecrets";

export const runtime = "nodejs";

/**
 * Шлёт уведомление в Telegram пользователю сайта (если он привязал Telegram). Нужен вход в аккаунт,
 * получатель должен быть связан с отправителем (заказ/обмен/переписка) или это админ/персонал,
 * ссылки из текста вырезаются, частота ограничена — иначе роут годился для фишинга от имени бота.
 */
export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    if (!caller) return NextResponse.json({ ok: false, error: "Не авторизован" }, { status: 401 });
    if (!(await rateLimit(`notify_tg_${caller}`, 40, 60_000))) {
      return NextResponse.json({ ok: false, error: "Слишком часто" }, { status: 429 });
    }

    const { uid, text, chat } = await req.json();
    if (typeof uid !== "string" || !uid || uid.length > 128 || typeof text !== "string" || !text) {
      return NextResponse.json({ ok: false, error: "uid и text обязательны" }, { status: 400 });
    }
    if (!(await mayNotify(caller, uid))) return NextResponse.json({ ok: false, error: "Нет доступа" }, { status: 403 });

    const linkSnap = await adminDb().collection("telegramLinks").doc(uid).get();
    if (!linkSnap.exists) return NextResponse.json({ ok: true, delivered: false });
    const { chatId } = linkSnap.data() as { chatId: number };

    const safeText = stripLinks(text, 600);
    if (typeof chat === "string" && chat) {
      const safeChat = maskSecrets(chat.slice(0, 4000));
      const html = `${escapeHtml(safeText)}\n${toTelegramHtml(safeChat, 200)}`;
      const sent = await sendTelegramMessage(chatId, html, undefined, "HTML");
      if (sent === null) await sendTelegramMessage(chatId, `${safeText}\n${previewText(safeChat, 200)}`);
    } else {
      await sendTelegramMessage(chatId, safeText);
    }
    return NextResponse.json({ ok: true, delivered: true });
  } catch (err) {
    console.error("notify/telegram error:", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
