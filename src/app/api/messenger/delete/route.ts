import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";
import { fail, loadChat, requireMessenger } from "@/lib/messenger/server";

export const runtime = "nodejs";

/**
 * POST { chatId, msgId } — удалить сообщение У ВСЕХ (своё; в группе админ может любое).
 * «Удалить только у себя» пока не реализовано: клиент может скрывать сообщение локально.
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
  const isAdmin = loaded.chat.type !== "dm" && loaded.chat.admins.includes(me.uid);
  if (m.from !== me.uid && !isAdmin) return fail("Нет прав удалить это сообщение", 403);

  await ref.update({ deletedForAll: true, text: FieldValue.delete(), mediaUrl: FieldValue.delete(), mediaUrls: FieldValue.delete(), reactions: {} });
  const upd: Record<string, unknown> = { pinnedMessageIds: FieldValue.arrayRemove(b.msgId) };
  if (loaded.chat.lastMessage?.at === m.createdAt) upd["lastMessage.text"] = "Сообщение удалено";
  await chatRef.update(upd);
  return NextResponse.json({ ok: true });
}
