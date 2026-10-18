import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { sendTelegramMessage } from "@/lib/telegramBot";
import { requireUser } from "@/lib/adminGuard";
import { rateLimit } from "@/lib/rateLimit";
import { cleanPlainText } from "@/lib/sanitizeNotify";

export const runtime = "nodejs";

function adminUids(): string[] {
  return (process.env.NEXT_PUBLIC_ADMIN_UIDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}

/** Уведомляет админов о новой заявке на продажу. Только для вошедших, с лимитом (раньше был открыт всем). */
export async function POST(req: NextRequest) {
  try {
    const guard = await requireUser(req);
    if ("error" in guard) return guard.error;
    if (!(await rateLimit(`notify-sellreq:${guard.uid}`, 20, 60 * 60 * 1000))) return NextResponse.json({ ok: true });

    const body = await req.json().catch(() => ({}));
    const itemName = cleanPlainText(body.itemName, 120, false);
    const game = cleanPlainText(body.game, 80, false);
    const price = cleanPlainText(String(body.price ?? ""), 40, false);
    const userNick = cleanPlainText(body.userNick, 60, false);
    const db = adminDb();

    for (const uid of adminUids()) {
      const linkSnap = await db.collection("telegramLinks").doc(uid).get();
      if (!linkSnap.exists) continue;
      const { chatId } = linkSnap.data() as { chatId: number };
      await sendTelegramMessage(
        chatId,
        `🏷️ Новая заявка на продажу\nПредмет: ${itemName}\nИгра: ${game}\nЦена: ${price} ₽\nОт: ${userNick}\n\nОткрой /admin/sell-requests на сайте, чтобы посмотреть.`
      );
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("notify-sell-request error:", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
