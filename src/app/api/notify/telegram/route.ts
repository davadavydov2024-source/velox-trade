import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { sendTelegramMessage } from "@/lib/telegramBot";
import { requireUser } from "@/lib/adminGuard";
import { rateLimit } from "@/lib/rateLimit";
import { cleanPlainText } from "@/lib/sanitizeNotify";

export const runtime = "nodejs";

/**
 * Шлёт уведомление в Telegram конкретному пользователю сайта — но только если он привязал
 * Telegram. Требует входа в аккаунт: раньше роут был открыт всем, и кто угодно мог слать любому
 * пользователю любой текст от имени бота (фишинг). Теперь: проверка токена, лимиты частоты
 * (на отправителя и на получателя), длина ≤ 800 и вырезание чужих ссылок (для не-админов).
 */
export async function POST(req: NextRequest) {
  try {
    const guard = await requireUser(req);
    if ("error" in guard) return guard.error;

    const { uid, text } = await req.json().catch(() => ({}));
    if (typeof uid !== "string" || !uid || uid.length > 128) return NextResponse.json({ ok: false, error: "uid обязателен" }, { status: 400 });
    const clean = cleanPlainText(text, 800, guard.isAdmin);
    if (!clean) return NextResponse.json({ ok: false, error: "text обязателен" }, { status: 400 });

    if (!guard.isAdmin) {
      if (!(await rateLimit(`tg-from:${guard.uid}`, 60, 60 * 60 * 1000))) return NextResponse.json({ ok: false, error: "Слишком часто" }, { status: 429 });
      if (!(await rateLimit(`tg-to:${uid}`, 30, 60 * 60 * 1000))) return NextResponse.json({ ok: true, delivered: false });
    }

    const linkSnap = await adminDb().collection("telegramLinks").doc(uid).get();
    if (!linkSnap.exists) return NextResponse.json({ ok: true, delivered: false });
    const { chatId } = linkSnap.data() as { chatId: number };
    await sendTelegramMessage(chatId, clean);

    return NextResponse.json({ ok: true, delivered: true });
  } catch (err) {
    console.error("notify/telegram error:", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
