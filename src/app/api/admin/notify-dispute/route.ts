import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { sendTelegramMessage } from "@/lib/telegramBot";
import { siteRow } from "@/lib/telegramAdminNotify";
import { requireUser } from "@/lib/requireUser";
import { rateLimit } from "@/lib/apiRateLimit";
import { stripLinks } from "@/lib/sanitizeText";
import { isAdminUid } from "@/lib/isAdmin";

export const runtime = "nodejs";

function adminUids(): string[] {
  return (process.env.NEXT_PUBLIC_ADMIN_UIDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}

/** Уведомляет админов о новой жалобе. Вызывать может только участник этого заказа. */
export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    if (!caller) return NextResponse.json({ ok: false, error: "Не авторизован" }, { status: 401 });
    if (!(await rateLimit(`notify_dispute_${caller}`, 5, 60_000))) {
      return NextResponse.json({ ok: false, error: "Слишком часто" }, { status: 429 });
    }

    const { orderId, reason } = await req.json();
    if (typeof orderId !== "string" || !orderId) return NextResponse.json({ ok: false, error: "orderId обязателен" }, { status: 400 });

    const db = adminDb();
    const orderSnap = await db.collection("orders").doc(orderId).get();
    const order = orderSnap.data() as { userId?: string; sellerId?: string } | undefined;
    if (!order || (order.userId !== caller && order.sellerId !== caller && !isAdminUid(caller))) {
      return NextResponse.json({ ok: false, error: "Нет доступа" }, { status: 403 });
    }
    const callerName = ((await db.collection("users").doc(caller).get()).data()?.displayName as string) ?? "пользователь";

    for (const uid of adminUids()) {
      const linkSnap = await db.collection("telegramLinks").doc(uid).get();
      if (!linkSnap.exists) continue;
      const { chatId } = linkSnap.data() as { chatId: number };
      await sendTelegramMessage(
        chatId,
        `⚠️ Новая жалоба на сделку\nЗаказ: ${orderId}\nОт: ${stripLinks(callerName, 60)}\nПричина: ${stripLinks(String(reason ?? ""), 500)}\n\nОткрой /admin/disputes на сайте, чтобы рассмотреть.`,
        [siteRow("/admin/disputes", "⚖️ Рассмотреть спор")]
      );
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("notify-dispute error:", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
