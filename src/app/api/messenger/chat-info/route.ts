import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { fail, isOwnMediaUrl, loadChat, requireMessenger } from "@/lib/messenger/server";

export const runtime = "nodejs";

/** POST { chatId, title?, description?, photoURL? } — название, описание, фото группы/канала (только админы). */
export async function POST(req: NextRequest) {
  const me = await requireMessenger(req);
  if ("error" in me) return me.error;
  const b = await req.json().catch(() => ({}));
  const loaded = await loadChat(b.chatId, me.uid);
  if ("error" in loaded) return loaded.error;
  const { chat } = loaded;
  if (chat.type === "dm") return fail("У личного чата нет настроек");
  if (!chat.admins.includes(me.uid)) return fail("Только админы", 403);
  const upd: Record<string, unknown> = {};
  if ("title" in b) {
    const t = String(b.title ?? "").trim();
    if (t.length < 2 || t.length > 60) return fail("Название — от 2 до 60 символов");
    upd.title = t;
  }
  if ("description" in b) upd.description = String(b.description ?? "").slice(0, 300);
  if ("photoURL" in b) {
    if (!b.photoURL) upd.photoURL = null;
    else if (isOwnMediaUrl(b.photoURL)) upd.photoURL = b.photoURL;
    else return fail("Некорректная ссылка на фото");
  }
  if (Object.keys(upd).length === 0) return fail("Нечего менять");
  await adminDb().collection("messengerChats").doc(chat.id).update(upd);
  return NextResponse.json({ ok: true });
}
