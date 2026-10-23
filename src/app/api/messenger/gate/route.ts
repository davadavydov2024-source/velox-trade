import { NextRequest, NextResponse } from "next/server";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { accessCodeConfigured, checkAccessCode, registrationOpen, signGateToken, fail } from "@/lib/messenger/server";

export const runtime = "nodejs";

/** GET -> { open: boolean }: нужен ли код доступа для регистрации (open: true — код НЕ нужен, показывать сразу форму почты и пароля). */
export async function GET() {
  return NextResponse.json({ open: registrationOpen() });
}

/**
 * POST { code } — проверка кода доступа. Нужна только если на Vercel задан MESSENGER_ACCESS_CODE;
 * по умолчанию (переменной нет) регистрация открыта и этот шаг пропускается.
 */
export async function POST(req: NextRequest) {
  if (registrationOpen()) return NextResponse.json({ open: true });
  if (!accessCodeConfigured()) return fail("Мессенджер ещё не настроен", 503);
  const ip = clientIp(req);
  if (!(await rateLimit(`msgr_gate_${ip}`, 8, 10 * 60_000))) return fail("Слишком много попыток, подожди несколько минут", 429);
  const { code } = await req.json().catch(() => ({ code: "" }));
  if (typeof code !== "string" || !code || code.length > 100 || !checkAccessCode(code)) return fail("Неверный код", 403);
  return NextResponse.json({ gateToken: signGateToken(), expiresInSec: 900 });
}
