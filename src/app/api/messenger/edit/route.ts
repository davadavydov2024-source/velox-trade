import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { fail, loadChat, previewOf, requireMessenger } from "@/lib/messenger/server";
import { MAX_MESSAGE_TEXT } from "@/lib/messenger/types";

export const runtime = "nodejs";

/** POST { chatId, msgId, text } — изменить СВОЁ текстовое сообщение (подпись к фото тоже). */
export async function POST(req: NextRequest) {
  const me = await requireMessenger(req);
  if ("error" in me) return me.error;
  const b = await req.json().catch(() => ({}));
  const loaded = await loadChat(b.chatId, me.uid);
  if ("error" in loaded) return loaded.error;
  const text = typeof b.text === "string" ? b.text.trim() : "";
  if (!text || text.length > MAX_MESSAGE_TEXT) return fail(`Текст — от 1 до ${MAX_MESSAGE_TEXT} символов`);
  if (typeof b.msgId !== "string" || !b.msgId || b.msgId.includes("/")) return fail("msgId обязателен");

  const chatRef = adminDb().collection("messengerChats").doc(loaded.chat.id);
  const ref = chatRef.collection("messages").doc(b.msgId);
  const m = (await ref.get()).data();
  if (!m || m.deletedForAll) return fail("Сообщение не найдено", 404);
  if (m.from !== me.uid) return fail("Можно менять только свои сообщения", 403);
  if (!["text", "image"].includes(m.kind)) return fail("Это сообщение нельзя изменить");
  await ref.update({ text, editedAt: Date.now() });
  if (loaded.chat.lastMessage?.at === m.createdAt && loaded.chat.lastMessage?.from === me.uid) {
    await chatRef.update({ "lastMessage.text": previewOf(m.kind, text) });
  }
  return NextResponse.json({ ok: true });
}
