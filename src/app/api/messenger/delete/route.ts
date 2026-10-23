import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";
import { canDo, fail, loadChat, requireMessenger } from "@/lib/messenger/server";

export const runtime = "nodejs";

/**
 * POST { chatId, msgId, forMe?: boolean }
 *  forMe: true — «удалить только у меня» (любое сообщение; клиент скрывает сообщения, где uid в hiddenFor);
 *  иначе — у всех: своё, либо чужое при праве «удалять сообщения» (админ/создатель).
 */
export async function POST(req: NextRequest) {
  const me = await requireMessenger(req);
  if ("error" in me) return me.error;
  const b = await req.json().catch(() => ({}));
  const loaded = await loadChat(b.chatId, me.uid);
  if ("error" in loaded) return loaded.error;
  if (typeof b.msgId !== "string" || !b.msgId || b.msgId.includes("/")) return fail("msgId обязателен");
  const chatRef = adminDb().collection("messengerChats").doc(loaded.chat.id);
  const ref = chatRef.collection("messages").doc(b.msgId);
  const m = (await ref.get()).data();
  if (!m || m.deletedForAll) return fail("Сообщение не найдено", 404);

  if (b.forMe === true) {
    await ref.update({ hiddenFor: FieldValue.arrayUnion(me.uid) });
    return NextResponse.json({ ok: true });
  }
  if (m.from !== me.uid && !canDo(loaded.chat, me.uid, "deleteMessages")) return fail("Нет прав удалить это сообщение у всех", 403);

  await ref.update({ deletedForAll: true, text: FieldValue.delete(), mediaUrl: FieldValue.delete(), mediaUrls: FieldValue.delete(), poll: FieldValue.delete(), reactions: {} });
  const upd: Record<string, unknown> = { pinnedMessageIds: FieldValue.arrayRemove(b.msgId) };
  if (loaded.chat.lastMessage?.at === m.createdAt) upd["lastMessage.text"] = "Сообщение удалено";
  await chatRef.update(upd);
  return NextResponse.json({ ok: true });
}
