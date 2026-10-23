import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";
import { canDo, fail, loadChat, requireMessenger } from "@/lib/messenger/server";

export const runtime = "nodejs";

/**
 * POST { chatId, msgId | msgIds: string[] (до 100), forMe?: boolean }
 *  forMe: true — «удалить у меня»: сообщение остаётся у остальных (клиент скрывает сообщения, где ваш uid в hiddenFor);
 *  иначе — «удалить для всех»: своё сообщение в любое время; чужое — при праве «удалять сообщения» (админ/создатель группы или канала).
 *  Выбрано несколько — удаляются пачкой: -> { ok, deleted, denied } (denied — сколько чужих без прав пропущено).
 * Целиком очистить чат для всех: POST /api/messenger/clear-chat.
 */
export async function POST(req: NextRequest) {
  const me = await requireMessenger(req);
  if ("error" in me) return me.error;
  const b = await req.json().catch(() => ({}));
  const loaded = await loadChat(b.chatId, me.uid);
  if ("error" in loaded) return loaded.error;
  const { chat } = loaded;

  const raw: unknown[] = Array.isArray(b.msgIds) ? b.msgIds : typeof b.msgId === "string" ? [b.msgId] : [];
  const ids = Array.from(new Set(raw.filter((x): x is string => typeof x === "string" && !!x && !x.includes("/")))).slice(0, 100);
  if (ids.length === 0) return fail("Выбери сообщения");

  const db = adminDb();
  const chatRef = db.collection("messengerChats").doc(chat.id);
  const snaps = await db.getAll(...ids.map((i) => chatRef.collection("messages").doc(i)));
  const isMod = canDo(chat, me.uid, "deleteMessages");
  const batch = db.batch();
  const removed: string[] = [];
  let denied = 0;
  let lastGone = false;

  for (const s of snaps) {
    const m = s.data();
    if (!m || m.deletedForAll) continue;
    if (b.forMe === true) {
      batch.update(s.ref, { hiddenFor: FieldValue.arrayUnion(me.uid) });
      removed.push(s.id);
      continue;
    }
    if (m.from !== me.uid && !isMod) { denied++; continue; }
    batch.update(s.ref, { deletedForAll: true, text: FieldValue.delete(), mediaUrl: FieldValue.delete(), mediaUrls: FieldValue.delete(), poll: FieldValue.delete(), sticker: FieldValue.delete(), reactions: {} });
    removed.push(s.id);
    if (chat.lastMessage?.at === m.createdAt) lastGone = true;
  }
  if (removed.length === 0) return denied > 0 ? fail("Нет прав удалить эти сообщения для всех", 403) : fail("Сообщения не найдены", 404);
  await batch.commit();

  if (b.forMe !== true) {
    const upd: Record<string, unknown> = { pinnedMessageIds: FieldValue.arrayRemove(...removed) };
    if (lastGone) upd["lastMessage.text"] = "Сообщение удалено";
    await chatRef.update(upd);
  }
  return NextResponse.json({ ok: true, deleted: removed.length, denied });
}
