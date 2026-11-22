import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rateLimit";
import { fail, requireMessenger } from "@/lib/messenger/server";
import { HandleError, changeHandle, checkHandle } from "@/lib/messenger/handles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET ?handle=имя — свободно ли имя (для подсказки при вводе). Без параметра — вернёт текущее имя. */
export async function GET(req: NextRequest) {
  const me = await requireMessenger(req);
  if ("error" in me) return me.error;
  if (!(await rateLimit(`msgr_handlechk_${me.uid}`, 90, 60_000))) return fail("Слишком часто", 429);
  return NextResponse.json(await checkHandle(me.uid, req.nextUrl.searchParams.get("handle") ?? ""));
}

/** POST { handle } — сменить свой @юзернейм. */
export async function POST(req: NextRequest) {
  const me = await requireMessenger(req);
  if ("error" in me) return me.error;
  if (!(await rateLimit(`msgr_handlechg_${me.uid}`, 8, 3_600_000))) return fail("Слишком много смен имени, попробуйте позже", 429);
  const b = await req.json().catch(() => ({}));
  try {
    const handle = await changeHandle(me.uid, b.handle);
    return NextResponse.json({ ok: true, handle });
  } catch (e) {
    if (e instanceof HandleError) return fail(e.message, e.status);
    console.error("change handle error:", e);
    return fail("Не удалось сменить имя", 500);
  }
}
