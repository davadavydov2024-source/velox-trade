import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { sendTelegramMessage } from "@/lib/telegramBot";

export const runtime = "nodejs";

function adminUids(): string[] {
  return (process.env.NEXT_PUBLIC_ADMIN_UIDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}

export async function POST(req: NextRequest) {
  try {
    const { orderId, reason, buyerName } = await req.json();
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
