import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rateLimit";
import { fail, requireMessenger } from "@/lib/messenger/server";
import { MAX_TOPUP_STARS, MIN_TOPUP_STARS, TOPUP_PAYLOAD_PREFIX, createStarsTopup } from "@/lib/starsWallet";

export const runtime = "nodejs";
const BOT = process.env.NEXT_PUBLIC_TELEGRAM_BOT || "veloxtrade_robot";

/** POST { amount } — заявка на пополнение ОТДЕЛЬНОГО кошелька MiliGram (не баланса Velox Trade). Возвращает ссылку на бота со счётом. */
export async function POST(req: NextRequest) {
  const me = await requireMessenger(req);
  if ("error" in me) return me.error;
  if (!(await rateLimit(`msgr_topup_${me.uid}`, 10, 60_000))) return fail("Слишком часто", 429);
  const b = await req.json().catch(() => ({}));
  const amount = Number(b.amount);
  if (!Number.isInteger(amount) || amount < MIN_TOPUP_STARS || amount > MAX_TOPUP_STARS) return fail(`Сумма — целое число от ${MIN_TOPUP_STARS} до ${MAX_TOPUP_STARS} ⭐`);
  try {
    const id = await createStarsTopup(me.uid, amount, "mili");
    return NextResponse.json({ ok: true, url: `https://t.me/${BOT}?start=${TOPUP_PAYLOAD_PREFIX}${id}` });
  } catch (e) {
    if ((e as Error)?.message === "too-many") return fail("Слишком много неоплаченных заявок — оплати прежние или подожди час", 429);
    console.error("messenger topup error:", e);
    return fail("Не удалось создать заявку", 500);
  }
}
