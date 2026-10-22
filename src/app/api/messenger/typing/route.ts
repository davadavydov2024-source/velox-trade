import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { rateLimit } from "@/lib/rateLimit";
import { loadChat, requireMessenger } from "@/lib/messenger/server";

export const runtime = "nodejs";

/** POST { chatId } — «печатает…». Пишет messengerChats/{id}/typing/{uid} = { at }; клиент считает «печатает», если at свежее 5 с. */
export async function POST(req: NextRequest) {
  const me = await requireMessenger(req);
  if ("error" in me) return me.error;
  if (!(await rateLimit(`msgr_typing_${me.uid}`, 30, 60_000))) return NextResponse.json({ ok: true });
  const b = await req.json().catch(() => ({}));
  const loaded = await loadChat(b.chatId, me.uid);
  if ("error" in loaded) return loaded.error;
  await adminDb().collection("messengerChats").doc(loaded.chat.id).collection("typing").doc(me.uid).set({ at: Date.now() });
  return NextResponse.json({ ok: true });
}
