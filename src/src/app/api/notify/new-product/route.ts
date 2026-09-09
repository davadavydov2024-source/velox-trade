import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { sendTelegramMessage } from "@/lib/telegramBot";

export const runtime = "nodejs";

function isAdminUid(uid: string): boolean {
  const list = (process.env.NEXT_PUBLIC_ADMIN_UIDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return list.includes(uid);
}

/** Рассылает всем, у кого привязан Telegram, уведомление о новом товаре в каталоге. */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const idToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const decoded = await adminAuth().verifyIdToken(idToken).catch(() => null);
    if (!decoded || !isAdminUid(decoded.uid)) {
      return NextResponse.json({ error: "Доступ только для администраторов" }, { status: 403 });
    }

    const { name, price } = await req.json();
    if (!name) return NextResponse.json({ error: "name обязателен" }, { status: 400 });

    const text = `🆕 Новый товар в каталоге: «${name}»${price ? ` — ${price} ₽` : ""}`;
    const linksSnap = await adminDb().collection("telegramLinks").get();

    let sent = 0;
    for (const linkDoc of linksSnap.docs) {
      const { chatId } = linkDoc.data() as { chatId: number };
      if (await sendTelegramMessage(chatId, text)) sent++;
      await new Promise((r) => setTimeout(r, 60));
    }

    return NextResponse.json({ ok: true, total: linksSnap.size, sent });
  } catch (err) {
    console.error("notify/new-product error:", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
