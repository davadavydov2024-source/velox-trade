import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { canDo, fail, loadChat, requireMessenger } from "@/lib/messenger/server";
import { PERMISSION_KEYS } from "@/lib/messenger/types";

export const runtime = "nodejs";
const SLOW = [0, 10, 30, 60, 300, 900, 3600];
const AUTODELETE = [0, 86400, 604800, 2678400]; // выкл, 1 день, 1 неделя, 1 месяц

/**
 * POST { chatId, permissions?, slowModeSec?, noForwards?, autoDeleteSec?, joinByRequest? }
 *  permissions: { sendMessages, sendMedia, sendStickers, sendPolls, addMembers, pinMessages, changeInfo } — права обычных участников группы;
 *  slowModeSec: медленный режим группы; noForwards: запретить пересылку из чата; autoDeleteSec: автоудаление сообщений;
 *  joinByRequest: вступление по ссылке только с одобрения. В личном чате доступны noForwards и autoDeleteSec (любому из двоих).
 */
export async function POST(req: NextRequest) {
  const me = await requireMessenger(req);
  if ("error" in me) return me.error;
  const b = await req.json().catch(() => ({}));
  const loaded = await loadChat(b.chatId, me.uid);
  if ("error" in loaded) return loaded.error;
  const { chat } = loaded;
  if (chat.type !== "dm" && !canDo(chat, me.uid, "changeInfo")) return fail("Нет права менять настройки чата", 403);

  const upd: Record<string, unknown> = {};
  if ("noForwards" in b) upd.noForwards = b.noForwards === true;
  if ("autoDeleteSec" in b) {
    if (!AUTODELETE.includes(Number(b.autoDeleteSec))) return fail("Автоудаление: 0, 1 день, 1 неделя или 1 месяц");
    upd.autoDeleteSec = Number(b.autoDeleteSec);
  }
  if (chat.type !== "dm") {
    if ("slowModeSec" in b) {
      if (chat.type !== "group" || !SLOW.includes(Number(b.slowModeSec))) return fail("Медленный режим: 0, 10, 30, 60, 300, 900 или 3600 с (только в группах)");
      upd.slowModeSec = Number(b.slowModeSec);
    }
    if ("joinByRequest" in b) upd.joinByRequest = b.joinByRequest === true;
    if (b.permissions && typeof b.permissions === "object") {
      if (chat.type !== "group") return fail("Права участников настраиваются только в группах");
      for (const k of PERMISSION_KEYS) if (typeof b.permissions[k] === "boolean") upd[`permissions.${k}`] = b.permissions[k];
    }
  }
  if (Object.keys(upd).length === 0) return fail("Нечего менять");
  await adminDb().collection("messengerChats").doc(chat.id).update(upd);
  return NextResponse.json({ ok: true });
}
