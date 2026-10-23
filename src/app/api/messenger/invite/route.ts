import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";
import { fail, loadChat, requireMessenger } from "@/lib/messenger/server";

export const runtime = "nodejs";

/** POST { chatId, action: "create"|"revoke" } — пригласительная ссылка группы/канала (только админы). Ссылка: /m?join=<code> */
export async function POST(req: NextRequest) {
  const me = await requireMessenger(req);
  if ("error" in me) return me.error;
  const b = await req.json().catch(() => ({}));
  const loaded = await loadChat(b.chatId, me.uid);
  if ("error" in loaded) return loaded.error;
  const { chat } = loaded;
  if (chat.type === "dm") return fail("У личного чата нет ссылки");
  if (!chat.admins.includes(me.uid)) return fail("Только админы", 403);
  const db = adminDb();
  const ref = db.collection("messengerChats").doc(chat.id);

  if (b.action === "revoke") {
    if (chat.inviteCode) await db.collection("messengerInvites").doc(chat.inviteCode).delete();
    await ref.update({ inviteCode: FieldValue.delete() });
    return NextResponse.json({ ok: true });
  }
  if (b.action !== "create") return fail("Действие: create или revoke");
  if (chat.inviteCode) return NextResponse.json({ code: chat.inviteCode, link: `/m?join=${chat.inviteCode}` });
  const code = randomBytes(9).toString("base64url");
  await db.collection("messengerInvites").doc(code).set({ chatId: chat.id, createdBy: me.uid, createdAt: Date.now() });
  await ref.update({ inviteCode: code });
  return NextResponse.json({ code, link: `/m?join=${code}` });
}
