import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { loadChat, requireMessenger } from "@/lib/messenger/server";

export const runtime = "nodejs";

/** POST { chatId } — отметить чат прочитанным (двойная галочка у собеседника) и обнулить счётчик. */
export async function POST(req: NextRequest) {
  const me = await requireMessenger(req);
  if ("error" in me) return me.error;
  const b = await req.json().catch(() => ({}));
  const loaded = await loadChat(b.chatId, me.uid);
  if ("error" in loaded) return loaded.error;
  const db = adminDb();
  const now = Date.now();
  const batch = db.batch();
  batch.update(db.collection("messengerChats").doc(loaded.chat.id), { [`readBy.${me.uid}`]: now });
  batch.set(db.collection("messengerUserChats").doc(me.uid).collection("chats").doc(loaded.chat.id), { unread: 0, mentions: 0, markedUnread: false }, { merge: true });
  batch.update(db.collection("messengerAccounts").doc(me.uid), { lastSeenAt: now });
  await batch.commit();
  return NextResponse.json({ ok: true });
}
