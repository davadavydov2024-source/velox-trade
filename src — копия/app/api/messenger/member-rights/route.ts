import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";
import { canDo, fail, loadChat, requireMessenger } from "@/lib/messenger/server";
import { ADMIN_RIGHT_KEYS, AdminRights } from "@/lib/messenger/types";

export const runtime = "nodejs";

/**
 * POST { chatId, uid, action, ... } — как в Telegram:
 *  restrict { until: ms (0 = навсегда), sendMessages?, sendMedia?, sendStickers?, sendPolls? (false = запретить) } / unrestrict
 *  ban / unban                       — бан: исключить и не пускать обратно
 *  setAdmin { rights?: {...}, title? } / removeAdmin / setTitle { title }
 * Права админа: changeInfo, deleteMessages, banUsers, inviteUsers, pinMessages, addAdmins, postMessages, editMessages.
 */
export async function POST(req: NextRequest) {
  const me = await requireMessenger(req);
  if ("error" in me) return me.error;
  const b = await req.json().catch(() => ({}));
  const loaded = await loadChat(b.chatId, me.uid);
  if ("error" in loaded) return loaded.error;
  const { chat } = loaded;
  if (chat.type === "dm") return fail("В личном чате нет ролей");
  const target = typeof b.uid === "string" ? b.uid : "";
  const ref = adminDb().collection("messengerChats").doc(chat.id);
  const isMember = chat.members.includes(target);

  if (["restrict", "unrestrict", "ban", "unban"].includes(b.action)) {
    if (!canDo(chat, me.uid, "banUsers")) return fail("Нет права ограничивать участников", 403);
    if (target === chat.createdBy) return fail("Создателя ограничить нельзя", 403);
    if (chat.admins.includes(target) && chat.createdBy !== me.uid) return fail("Админов ограничивает только создатель", 403);
  }

  switch (b.action) {
    case "restrict": {
      if (!isMember) return fail("Такого участника нет", 404);
      const until = Number(b.until) > Date.now() ? Number(b.until) : 8640000000000000 / 1000; // 0/прошлое = навсегда
      const r: Record<string, unknown> = { until };
      for (const k of ["sendMessages", "sendMedia", "sendStickers", "sendPolls"]) if (b[k] === false) r[k] = false;
      if (Object.keys(r).length === 1) r.sendMessages = false; // ничего не указали — полный мьют
      await ref.update({ [`restricted.${target}`]: r });
      break;
    }
    case "unrestrict":
      await ref.update({ [`restricted.${target}`]: FieldValue.delete() });
      break;
    case "ban":
      await ref.update({ members: FieldValue.arrayRemove(target), admins: FieldValue.arrayRemove(target), banned: FieldValue.arrayUnion(target), [`adminRights.${target}`]: FieldValue.delete(), [`adminTitles.${target}`]: FieldValue.delete(), [`restricted.${target}`]: FieldValue.delete() });
      break;
    case "unban":
      await ref.update({ banned: FieldValue.arrayRemove(target) });
      break;
    case "setAdmin": {
      if (!canDo(chat, me.uid, "addAdmins")) return fail("Нет права назначать админов", 403);
      if (!isMember) return fail("Сначала человек должен быть участником", 404);
      if (target === chat.createdBy) return fail("Создатель и так владеет чатом");
      const rights: AdminRights = {};
      for (const k of ADMIN_RIGHT_KEYS) if (b.rights && typeof b.rights[k] === "boolean") rights[k] = b.rights[k];
      if (rights.addAdmins && chat.createdBy !== me.uid) return fail("Право назначать админов может дать только создатель", 403);
      const upd: Record<string, unknown> = { admins: FieldValue.arrayUnion(target), [`adminRights.${target}`]: rights };
      if (typeof b.title === "string") upd[`adminTitles.${target}`] = b.title.trim().slice(0, 16);
      await ref.update(upd);
      break;
    }
    case "removeAdmin":
      if (!canDo(chat, me.uid, "addAdmins")) return fail("Нет права снимать админов", 403);
      if (target === chat.createdBy) return fail("Создателя снять нельзя", 403);
      if (chat.admins.includes(target) && chat.createdBy !== me.uid && chat.adminRights?.[target]?.addAdmins) return fail("Такого админа снимает только создатель", 403);
      await ref.update({ admins: FieldValue.arrayRemove(target), [`adminRights.${target}`]: FieldValue.delete(), [`adminTitles.${target}`]: FieldValue.delete() });
      break;
    case "setTitle":
      if (!canDo(chat, me.uid, "addAdmins")) return fail("Нет права менять подписи админов", 403);
      if (!chat.admins.includes(target) && target !== chat.createdBy) return fail("Подпись есть только у админов");
      await ref.update({ [`adminTitles.${target}`]: String(b.title ?? "").trim().slice(0, 16) });
      break;
    default:
      return fail("Неизвестное действие");
  }
  return NextResponse.json({ ok: true });
}
