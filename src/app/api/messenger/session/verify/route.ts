import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rateLimit";
import { DEVICE_RE, checkLoginCode, fail, requireMessenger } from "@/lib/messenger/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST { deviceId, code } — подтверждение входа с нового устройства кодом из MiliGram / Telegram-бота. */
export async function POST(req: NextRequest) {
  const me = await requireMessenger(req, { allowPending: true });
  if ("error" in me) return me.error;
  const b = await req.json().catch(() => ({}));
  if (typeof b.deviceId !== "string" || !DEVICE_RE.test(b.deviceId)) return fail("Некорректное устройство");
  const code = String(b.code ?? "").replace(/\D/g, "");
  if (code.length !== 6) return fail("Код — 6 цифр");
  if (!(await rateLimit(`msgr_logincheck_${me.uid}`, 15, 10 * 60_000))) return fail("Слишком много попыток, подожди немного", 429);
  const res = await checkLoginCode(me.uid, b.deviceId, code);
  if (res === "ok") return NextResponse.json({ ok: true });
  if (res === "expired") return fail("Код устарел — запроси новый", 410);
  if (res === "locked") return fail("Слишком много неверных попыток — запроси новый код", 429);
  return fail("Неверный код", 400);
}
