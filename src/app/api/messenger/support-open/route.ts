import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rateLimit";
import { fail, requireMessenger } from "@/lib/messenger/server";
import { openSupport } from "@/lib/messenger/support";

export const runtime = "nodejs";

/** POST — открыть чат с поддержкой MiliGram (создаётся при первом обращении, поддержка здоровается). → { chatId } */
export async function POST(req: NextRequest) {
  const me = await requireMessenger(req);
  if ("error" in me) return me.error;
  if (!(await rateLimit(`msgr_support_open_${me.uid}`, 20, 60_000))) return fail("Слишком часто", 429);
  return NextResponse.json({ chatId: await openSupport(me.uid) });
}
