import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { fail, loadChat, requireMessenger } from "@/lib/messenger/server";
import { limitsFor } from "@/lib/messenger/premium";

export const runtime = "nodejs";
const MAX_PINNED_CHATS = 5;

/** POST { chatId, pinned?, archived?, muted?, mutedUntil?, folderIds?, markedUnread?, clearHistory? } — личные настройки чата (видны только мне). */
export async function POST(req: NextRequest) {
  const me = await requireMessenger(req);
  if ("error" in me) return me.error;
  const b = await req.json().catch(() => ({}));
  const loaded = await loadChat(b.chatId, me.uid);
  if ("error" in loaded) return loaded.error;
  const db = adminDb();
  const ref = db.collection("messengerUserChats").doc(me.uid).collection("chats").doc(loaded.chat.id);
  const upd: Record<string, unknown> = {};

  if ("pinned" in b) {
    if (b.pinned === true) {
      const cur = (await ref.get()).data();
      if (!cur?.pinned) {
        const count = (await db.collection("messengerUserChats").doc(me.uid).collection("chats").where("pinned", "==", true).count().get()).data().count;
        const max = limitsFor(me.account).pinnedChats;
        if (count >= max) return fail(`Можно закрепить не больше ${max} чатов (с Mili Premium — больше)`);
      }
      upd.pinned = true;
      upd.pinnedAt = Date.now();
    } else {
      upd.pinned = false;
    }
  }
  if ("archived" in b) upd.archived = b.archived === true;
  if ("markedUnread" in b) upd.markedUnread = b.markedUnread === true; // «отметить непрочитанным»
  if (b.hide === true) { const t = Date.now(); upd.hiddenAt = t; upd.clearedAt = t; upd.pinned = false; upd.archived = false; } // «удалить чат у меня»
  if (b.clearHistory === true) upd.clearedAt = Date.now(); // «очистить историю» (только у меня): клиент скрывает сообщения старше clearedAt
  if ("muted" in b) {
    upd.muted = b.muted === true;
    upd.mutedUntil = b.muted === true && typeof b.mutedUntil === "number" && b.mutedUntil > Date.now() ? b.mutedUntil : null;
  }
  if ("folderIds" in b) {
    const ids: string[] = Array.isArray(b.folderIds) ? Array.from(new Set(b.folderIds.filter((x: unknown) => typeof x === "string" && x && !x.includes("/")))).slice(0, 10) as string[] : [];
    if (ids.length) {
      const docs = await db.getAll(...ids.map((i) => db.collection("messengerUserFolders").doc(me.uid).collection("folders").doc(i)));
      if (docs.some((d) => !d.exists)) return fail("Такой папки нет");
    }
    upd.folderIds = ids;
  }
  if (Object.keys(upd).length === 0) return fail("Нечего менять");
  await ref.set(upd, { merge: true });
  return NextResponse.json({ ok: true });
}
