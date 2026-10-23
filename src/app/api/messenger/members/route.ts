import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";
import { fail, loadChat, requireMessenger, uidByHandle } from "@/lib/messenger/server";

export const runtime = "nodejs";
const MAX_MEMBERS = 200;

/** POST { chatId, action: "add"|"remove"|"leave"|"promote"|"demote", handles?: string[], uid?: string } — участники группы/канала. */
export async function POST(req: NextRequest) {
  const me = await requireMessenger(req);
  if ("error" in me) return me.error;
  const b = await req.json().catch(() => ({}));
  const loaded = await loadChat(b.chatId, me.uid);
  if ("error" in loaded) return loaded.error;
  const { chat } = loaded;
  if (chat.type === "dm") return fail("В личном чате нельзя менять участников");
  const ref = adminDb().collection("messengerChats").doc(chat.id);
  const isAdmin = chat.admins.includes(me.uid);

  if (b.action === "leave") {
    const left = chat.members.filter((m) => m !== me.uid);
    if (left.length === 0) {
      await ref.delete();
      return NextResponse.json({ ok: true, deleted: true });
    }
    const upd: Record<string, unknown> = { members: FieldValue.arrayRemove(me.uid), admins: FieldValue.arrayRemove(me.uid) };
    await ref.update(upd);
    if (chat.admins.filter((a) => a !== me.uid).length === 0) await ref.update({ admins: FieldValue.arrayUnion(left[0]) });
    return NextResponse.json({ ok: true });
  }

  if (!isAdmin) return fail("Только админы могут менять состав", 403);

  if (b.action === "add") {
    const handles: string[] = Array.isArray(b.handles) ? b.handles.slice(0, 50) : [];
    const add: string[] = [];
    for (const h of handles) {
      const u = await uidByHandle(String(h));
      if (!u) return fail(`Пользователь @${String(h).replace(/^@/, "")} не найден`, 404);
      if (!chat.members.includes(u) && !add.includes(u)) add.push(u);
    }
    if (add.length === 0) return fail("Некого добавлять");
    const max = chat.type === "channel" ? 5000 : MAX_MEMBERS;
    if (chat.members.length + add.length > max) return fail(`Не больше ${max} участников`);
    await ref.update({ members: FieldValue.arrayUnion(...add) });
    return NextResponse.json({ ok: true });
  }

  const target = typeof b.uid === "string" ? b.uid : "";
  if (!chat.members.includes(target)) return fail("Такого участника нет", 404);
  if (target === chat.createdBy && b.action !== "promote") return fail("Создателя чата менять нельзя", 403);

  if (b.action === "remove") {
    await ref.update({ members: FieldValue.arrayRemove(target), admins: FieldValue.arrayRemove(target) });
  } else if (b.action === "promote") {
    await ref.update({ admins: FieldValue.arrayUnion(target) });
  } else if (b.action === "demote") {
    await ref.update({ admins: FieldValue.arrayRemove(target) });
  } else return fail("Неизвестное действие");
  return NextResponse.json({ ok: true });
}
