import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireMessenger } from "@/lib/messenger/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST — «я в сети»: клиент пингует раз в минуту, пока вкладка открыта (MessengerApp).
 * Обновляет lastSeenAt; показ «был(а) в сети» у других учитывает настройку приватности владельца.
 * Раньше этого маршрута не было — каждый пинг заканчивался 404 и засорял консоль.
 */
export async function POST(req: NextRequest) {
  const me = await requireMessenger(req);
  if ("error" in me) return me.error;
  const now = Date.now();
  // не пишем чаще раза в 20 секунд — лишние записи в Firestore ни к чему
  if (now - (me.account.lastSeenAt ?? 0) >= 20_000) {
    await adminDb().collection("messengerAccounts").doc(me.uid).update({ lastSeenAt: now }).catch(() => {});
  }
  return NextResponse.json({ ok: true, at: now });
}
