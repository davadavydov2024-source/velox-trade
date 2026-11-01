import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { rateLimit } from "@/lib/rateLimit";
import { fail, requireMessenger } from "@/lib/messenger/server";
import { PAID_MESSAGE_MAX, isPlus } from "@/lib/messenger/premium";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — кошелёк ⭐: баланс, цена за сообщение, сколько заработано на платных сообщениях и история операций. */
export async function GET(req: NextRequest) {
  const me = await requireMessenger(req);
  if ("error" in me) return me.error;
  const db = adminDb();
  const [user, logSnap] = await Promise.all([db.collection("users").doc(me.uid).get(), db.collection("miliWalletLog").where("uid", "==", me.uid).limit(300).get()]);
  const all = logSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as { id: string; delta: number; type: string; ref?: string; name?: string; at: number }).sort((a, b) => b.at - a.at);
  const earned = all.filter((r) => r.type === "paid_message_in").reduce((n, r) => n + r.delta, 0);
  return NextResponse.json({
    wallet: (user.data()?.miliWallet as number | undefined) ?? 0,
    plus: isPlus(me.account), plusUntil: me.account.plusUntil ?? null,
    messagePrice: me.account.messagePrice ?? 0, maxPrice: PAID_MESSAGE_MAX,
    earned, log: all.slice(0, 80).map((r) => ({ id: r.id, delta: r.delta, type: r.type, name: r.name ?? "", at: r.at })),
  });
}

/** POST { price } — цена за входящее сообщение (0 — бесплатно). Только с «Премиум Плюс». */
export async function POST(req: NextRequest) {
  const me = await requireMessenger(req);
  if ("error" in me) return me.error;
  if (!(await rateLimit(`msgr_price_${me.uid}`, 20, 60_000))) return fail("Слишком часто", 429);
  if (!isPlus(me.account)) return fail("Платные сообщения доступны с «Премиум Плюс»", 403);
  const b = await req.json().catch(() => ({}));
  const price = Number(b.price);
  if (!Number.isInteger(price) || price < 0 || price > PAID_MESSAGE_MAX) return fail(`Цена — целое число от 0 до ${PAID_MESSAGE_MAX} ⭐`);
  await adminDb().collection("messengerAccounts").doc(me.uid).update({ messagePrice: price });
  return NextResponse.json({ ok: true, messagePrice: price });
}
