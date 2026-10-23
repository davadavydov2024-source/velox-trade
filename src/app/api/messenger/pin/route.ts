import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";
import { canDo, fail, loadChat, requireMessenger } from "@/lib/messenger/server";

export const runtime = "nodejs";
const MAX_PINS = 5;

/** POST { chatId, msgId, pinned: boolean } — закрепить/открепить сообщение (в группе — по праву «закреплять», в канале — админы). */
export async function POST(req: NextRequest) {
  const me = await requireMessenger(req);
  if ("error" in me) return me.error;
  const b = await req.json().catch(() => ({}));
  const loaded = await loadChat(b.chatId, me.uid);
  if ("error" in loaded) return loaded.error;
  const { chat } = loaded;
  if (!canDo(chat, me.uid, "pinMessages")) return fail("У тебя нет права закреплять сообщения", 403);
  if (typeof b.msgId !== "string" || !b.msgId || b.msgId.includes("/")) return fail("msgId обязателен");

  const chatRef = adminDb().collection("messengerChats").doc(chat.id);
  if (b.pinned === false) {
    await chatRef.update({ pinnedMessageIds: FieldValue.arrayRemove(b.msgId) });
    return NextResponse.json({ ok: true });
  }
  const msg = await chatRef.collection("messages").doc(b.msgId).get();
  if (!msg.exists || msg.data()!.deletedForAll) return fail("Сообщение не найдено", 404);
  if (!chat.pinnedMessageIds?.includes(b.msgId) && (chat.pinnedMessageIds?.length ?? 0) >= MAX_PINS) return fail(`Можно закрепить не больше ${MAX_PINS} сообщений`);
  await chatRef.update({ pinnedMessageIds: FieldValue.arrayUnion(b.msgId) });
  return NextResponse.json({ ok: true });
}
