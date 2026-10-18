import { NextRequest, NextResponse } from "next/server";
import { releaseDuePayouts } from "@/lib/payouts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Периодически зачисляет выплаты, у которых закончился 48-часовой холд (см. lib/payouts.ts).
 * Защищено тем же CRON_SECRET, что и остальные cron-роуты.
 *
 * Дополнительно выплаты «подтягиваются» ленивo: когда продавец открывает профиль, вызывается
 * api/payouts/mine и его созревшие выплаты зачисляются сразу — так деньги приходят вовремя, даже если
 * крон на тарифе Vercel Hobby запускается раз в сутки.
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  // Fail closed: без CRON_SECRET (или с неверным) роут не выполняется — раньше при незаданной
  // переменной его мог запустить кто угодно. Vercel Cron сам подставляет CRON_SECRET в заголовок.
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Не авторизован (проверь CRON_SECRET)" }, { status: 401 });
  }
  try {
    const { released, failed } = await releaseDuePayouts();
    return NextResponse.json({ ok: true, released, failed });
  } catch (err) {
    console.error("release-payouts error:", err);
    return NextResponse.json({ ok: false, error: "query failed" }, { status: 500 });
  }
}
