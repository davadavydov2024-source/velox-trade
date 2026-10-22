import { NextRequest, NextResponse } from "next/server";
import { FieldPath } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";
import { rateLimit } from "@/lib/rateLimit";
import { fail, loadChat, requireMessenger } from "@/lib/messenger/server";
import { ALLOWED_REACTIONS } from "@/lib/messenger/types";

export const runtime = "nodejs";

/** POST { chatId, msgId, emoji } — поставить/убрать свою реакцию (повторный вызов снимает). */
export async function POST(req: NextRequest) {
  const me = await requireMessenger(req);
  if ("error" in me) return me.error;
  if (!(await rateLimit(`msgr_react_${me.uid}`, 60, 60_000))) return fail("Слишком часто", 429);
  const b = await req.json().catch(() => ({}));
  if (!(ALLOWED_REACTIONS as readonly string[]).includes(b.emoji)) return fail("Такой реакции нет");
  const loaded = await loadChat(b.chatId, me.uid);
  if ("error" in loaded) return loaded.error;
  if (typeof b.msgId !== "string" || !b.msgId || b.msgId.includes("/")) return fail("msgId обязателен");

  const ref = adminDb().collection("messengerChats").doc(loaded.chat.id).collection("messages").doc(b.msgId);
  const emoji: string = b.emoji;
  const result = await adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.data()!.deletedForAll) return null;
    const list: string[] = snap.data()!.reactions?.[emoji] ?? [];
    const has = list.includes(me.uid);
    const next = has ? list.filter((u) => u !== me.uid) : [...list, me.uid];
    tx.update(ref, new FieldPath("reactions", emoji), next);
    return has ? "removed" : "added";
  });
  if (!result) return fail("Сообщение не найдено", 404);
  return NextResponse.json({ ok: true, result });
}
