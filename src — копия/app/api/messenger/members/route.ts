import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";
import { canDo, fail, loadChat, requireMessenger, uidByHandle } from "@/lib/messenger/server";

export const runtime = "nodejs";

/**
 * POST { chatId, action, handles?, uid?, ban? }
 *  add — добавить по @handle (право «добавлять участников»; уважает приватность человека и список забаненных);
 *  remove — исключить (право «блокировать»; ban:true — ещё и забанить); leave — выйти;
 *  deleteChat — удалить группу/канал целиком (только создатель).
 * Права админов и ограничения участников — в /api/messenger/member-rights.
 */
export async function POST(req: NextRequest) {
  const me = await requireMessenger(req);
  if ("error" in me) return me.error;
  const b = await req.json().catch(() => ({}));
  const loaded = await loadChat(b.chatId, me.uid);
  if ("error" in loaded) return loaded.error;
  const { chat } = loaded;
  if (chat.type === "dm") return fail("В личном чате нельзя менять участников");
  const db = adminDb();
  const ref = db.collection("messengerChats").doc(chat.id);

  if (b.action === "leave") {
    if (chat.createdBy === me.uid && chat.members.length > 1) return fail("Создатель не может выйти: удали чат или передай управление (назначь другого админа и удали чат при необходимости)");
    const left = chat.members.filter((m) => m !== me.uid);
    if (left.length === 0) {
      await ref.delete();
      return NextResponse.json({ ok: true, deleted: true });
    }
    await ref.update({ members: FieldValue.arrayRemove(me.uid), admins: FieldValue.arrayRemove(me.uid), [`adminRights.${me.uid}`]: FieldValue.delete(), [`adminTitles.${me.uid}`]: FieldValue.delete() });
    return NextResponse.json({ ok: true });
  }

  if (b.action === "deleteChat") {
    if (chat.createdBy !== me.uid) return fail("Удалить чат может только создатель", 403);
    if (chat.handle) await db.collection("messengerHandles").doc(chat.handle).delete().catch(() => {});
    if (chat.inviteCode) await db.collection("messengerInvites").doc(chat.inviteCode).delete().catch(() => {});
    await ref.delete();
    return NextResponse.json({ ok: true, deleted: true });
  }

  if (b.action === "add") {
    if (!canDo(chat, me.uid, "addMembers")) return fail("Тебе нельзя добавлять участников", 403);
    const handles: string[] = Array.isArray(b.handles) ? b.handles.slice(0, 50) : [];
    const add: string[] = [];
    const skipped: string[] = [];
    for (const h of handles) {
      const u = await uidByHandle(String(h));
      if (!u) return fail(`Пользователь @${String(h).replace(/^@/, "")} не найден`, 404);
      if (chat.members.includes(u) || add.includes(u)) continue;
      if (chat.banned?.includes(u) && !canDo(chat, me.uid, "banUsers")) { skipped.push(String(h)); continue; }
      const acc = (await db.collection("messengerAccounts").doc(u).get()).data();
      if (!acc || acc.banned || acc.privacy?.whoCanAddToGroups === "nobody") { skipped.push(String(h)); continue; }
      add.push(u);
    }
    if (add.length === 0) return NextResponse.json({ ok: true, added: 0, skipped }); // никого не добавили (приватность/бан)
    const max = chat.type === "channel" ? 5000 : 200;
    if (chat.members.length + add.length > max) return fail(`Не больше ${max} участников`);
    await ref.update({ members: FieldValue.arrayUnion(...add), ...(chat.banned ? { banned: FieldValue.arrayRemove(...add) } : {}) });
    return NextResponse.json({ ok: true, added: add.length, skipped });
  }

  if (b.action === "remove") {
    if (!canDo(chat, me.uid, "banUsers")) return fail("Нет права исключать участников", 403);
    const target = typeof b.uid === "string" ? b.uid : "";
    if (!chat.members.includes(target)) return fail("Такого участника нет", 404);
    if (target === chat.createdBy) return fail("Создателя исключить нельзя", 403);
    if (chat.admins.includes(target) && chat.createdBy !== me.uid) return fail("Админов исключает только создатель", 403);
    await ref.update({
      members: FieldValue.arrayRemove(target), admins: FieldValue.arrayRemove(target),
      [`adminRights.${target}`]: FieldValue.delete(), [`adminTitles.${target}`]: FieldValue.delete(), [`restricted.${target}`]: FieldValue.delete(),
      ...(b.ban === true ? { banned: FieldValue.arrayUnion(target) } : {}),
    });
    return NextResponse.json({ ok: true });
  }
  return fail("Действие: add, remove, leave или deleteChat");
}
