import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";
import { canDo, fail, loadChat, requireMessenger } from "@/lib/messenger/server";

export const runtime = "nodejs";
export const maxDuration = 60;
const PAGE = 400;

/**
 * POST { chatId, forAll: true } — «очистить историю у ВСЕХ» (как «Удалить для меня и собеседника» в Telegram).
 * Личный чат: любой из двоих. Группа/канал: создатель или админ с правом «удалять сообщения». Служебный чат так очистить нельзя.
 * Удаляет до 2000 сообщений за вызов: -> { ok, deleted, done }. Пока done:false — вызывай снова.
 * «Очистить только у меня» — chat-settings { clearHistory:true }.
 */
export async function POST(req: NextRequest) {
  const me = await requireMessenger(req);
  if ("error" in me) return me.error;
  const b = await req.json().catch(() => ({}));
  const loaded = await loadChat(b.chatId, me.uid);
  if ("error" in loaded) return loaded.error;
  const { chat } = loaded;
  if (b.forAll !== true) return fail("Для очистки только у себя используй chat-settings { clearHistory: true }");
  if (chat.service) return fail("Служебный чат нельзя очистить для всех", 403);
  if (chat.type !== "dm" && !canDo(chat, me.uid, "deleteMessages")) return fail("Нет права очищать историю для всех", 403);

  const db = adminDb();
  const chatRef = db.collection("messengerChats").doc(chat.id);
  let deleted = 0;
  let done = false;
  for (let i = 0; i < 5; i++) {
    const snap = await chatRef.collection("messages").limit(PAGE).get();
    if (snap.empty) { done = true; break; }
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    deleted += snap.size;
    if (snap.size < PAGE) { done = true; break; }
  }
  if (done) {
    await chatRef.update({ lastMessage: FieldValue.delete(), pinnedMessageIds: [], updatedAt: Date.now() });
    const batch = db.batch();
    chat.members.slice(0, 400).forEach((u) => batch.set(db.collection("messengerUserChats").doc(u).collection("chats").doc(chat.id), { unread: 0, mentions: 0 }, { merge: true }));
    await batch.commit();
  }
  return NextResponse.json({ ok: true, deleted, done });
}
