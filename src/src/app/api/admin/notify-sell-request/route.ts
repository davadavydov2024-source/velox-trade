import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { sendTelegramMessage } from "@/lib/telegramBot";

export const runtime = "nodejs";

function adminUids(): string[] {
  return (process.env.NEXT_PUBLIC_ADMIN_UIDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}

export async function POST(req: NextRequest) {
  try {
    const { itemName, game, price, userNick } = await req.json();
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
