import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebaseAdmin";
import { createStarsTopup, MAX_TOPUP_STARS, MIN_TOPUP_STARS, TOPUP_PAYLOAD_PREFIX } from "@/lib/starsWallet";

export const runtime = "nodejs";

const BOT = process.env.NEXT_PUBLIC_TELEGRAM_BOT || "veloxtrade_robot";

/** Создаёт заявку на пополнение баланса ⭐ и возвращает ссылку на бота, где выставляется счёт. Тело: { amount }. */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const idToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    const decoded = await adminAuth().verifyIdToken(idToken).catch(() => null);
    if (!decoded) return NextResponse.json({ error: "Сессия истекла" }, { status: 401 });

    const { amount } = (await req.json().catch(() => ({}))) as { amount?: number };
    if (!Number.isInteger(amount) || (amount as number) < MIN_TOPUP_STARS || (amount as number) > MAX_TOPUP_STARS) {
      return NextResponse.json({ error: `Сумма — целое число от ${MIN_TOPUP_STARS} до ${MAX_TOPUP_STARS} ⭐` }, { status: 400 });
    }

    const id = await createStarsTopup(decoded.uid, amount as number);
    return NextResponse.json({ ok: true, url: `https://t.me/${BOT}?start=${TOPUP_PAYLOAD_PREFIX}${id}` });
  } catch (err: any) {
    if (err?.message === "too-many") return NextResponse.json({ error: "Слишком много неоплаченных заявок — оплати прежние или подожди час" }, { status: 429 });
    console.error("stars/topup error:", err);
    return NextResponse.json({ error: "Не удалось создать заявку" }, { status: 500 });
  }
}
