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

/** Уведомляет админов о новой жалобе. Только для вошедших, с лимитом (раньше был открыт всем — спам админам). */
export async function POST(req: NextRequest) {
  try {
    const guard = await requireUser(req);
    if ("error" in guard) return guard.error;
    if (!(await rateLimit(`notify-dispute:${guard.uid}`, 10, 60 * 60 * 1000))) return NextResponse.json({ ok: true });

    const body = await req.json().catch(() => ({}));
    const orderId = cleanPlainText(body.orderId, 64, false);
    const reason = cleanPlainText(body.reason, 400, false);
    const buyerName = cleanPlainText(body.buyerName, 60, false);
    const db = adminDb();

    for (const uid of adminUids()) {
      const linkSnap = await db.collection("telegramLinks").doc(uid).get();
      if (!linkSnap.exists) continue;
      const { chatId } = linkSnap.data() as { chatId: number };
      await sendTelegramMessage(
        chatId,
        `⚠️ Новая жалоба на сделку\nЗаказ: ${orderId}\nОт: ${buyerName}\nПричина: ${reason}\n\nОткрой /admin/disputes на сайте, чтобы рассмотреть.`
      );
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("notify-dispute error:", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
