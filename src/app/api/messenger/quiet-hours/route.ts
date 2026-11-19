import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { fail, requireMessenger } from "@/lib/messenger/server";
import { cleanQuiet } from "@/lib/messenger/quiet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const me = await requireMessenger(req);
  if ("error" in me) return me.error;
  return NextResponse.json({ quiet: (me.account as any).quiet ?? null });
}

/** POST { enabled, from, to, tz } — тихие часы (минуты от полуночи, tz — смещение от UTC в минутах). */
export async function POST(req: NextRequest) {
  const me = await requireMessenger(req);
  if ("error" in me) return me.error;
  const q = cleanQuiet(await req.json().catch(() => ({})));
  if (!q) return fail("Некорректное время");
  await adminDb().collection("messengerAccounts").doc(me.uid).update({ quiet: q });
  return NextResponse.json({ ok: true, quiet: q });
}
