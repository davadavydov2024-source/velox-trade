import { NextRequest, NextResponse } from "next/server";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { accessCodeConfigured, checkAccessCode, signGateToken, fail } from "@/lib/messenger/server";

export const runtime = "nodejs";

/** Проверка кода доступа. Код задаётся на Vercel: MESSENGER_ACCESS_CODE (+ MESSENGER_GATE_SECRET, 16+ символов). */
export async function POST(req: NextRequest) {
  if (!accessCodeConfigured()) return fail("Мессенджер ещё не настроен", 503);
  const ip = clientIp(req);
  if (!(await rateLimit(`msgr_gate_${ip}`, 8, 10 * 60_000))) return fail("Слишком много попыток, подожди несколько минут", 429);
  const { code } = await req.json().catch(() => ({ code: "" }));
  if (typeof code !== "string" || !code || code.length > 100 || !checkAccessCode(code)) return fail("Неверный код", 403);
  return NextResponse.json({ gateToken: signGateToken(), expiresInSec: 900 });
}
