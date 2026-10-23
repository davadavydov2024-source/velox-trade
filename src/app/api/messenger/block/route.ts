import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { fail, requireMessenger, uidByHandle } from "@/lib/messenger/server";

export const runtime = "nodejs";

/** POST { handle, blocked: boolean } — заблокировать/разблокировать человека (в личных чатах писать нельзя никому из двоих). */
export async function POST(req: NextRequest) {
  const me = await requireMessenger(req);
  if ("error" in me) return me.error;
  const b = await req.json().catch(() => ({}));
  const target = await uidByHandle(String(b.handle ?? ""));
  if (!target) return fail("Пользователь не найден", 404);
  if (target === me.uid) return fail("Себя блокировать нельзя");
  const ref = adminDb().collection("messengerBlocks").doc(me.uid).collection("blocked").doc(target);
  if (b.blocked === false) await ref.delete();
  else await ref.set({ at: Date.now() });
  return NextResponse.json({ ok: true });
}
