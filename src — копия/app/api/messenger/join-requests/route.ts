import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";
import { canDo, fail, loadChat, requireMessenger } from "@/lib/messenger/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET ?chatId= — заявки на вступление (право «приглашать»). */
export async function GET(req: NextRequest) {
  const me = await requireMessenger(req);
  if ("error" in me) return me.error;
  const loaded = await loadChat(req.nextUrl.searchParams.get("chatId"), me.uid);
  if ("error" in loaded) return loaded.error;
  if (!canDo(loaded.chat, me.uid, "inviteUsers")) return fail("Нет доступа", 403);
  const db = adminDb();
  const snap = await db.collection("messengerJoinRequests").where("chatId", "==", loaded.chat.id).limit(100).get();
  const uids = snap.docs.map((d) => d.data().uid as string);
  const accs = uids.length ? await db.getAll(...uids.map((u) => db.collection("messengerAccounts").doc(u))) : [];
  return NextResponse.json({ requests: accs.map((a, i) => ({ uid: a.id, handle: a.data()?.handle ?? "", displayName: a.data()?.displayName ?? "Пользователь", photoURL: a.data()?.photoURL ?? null, createdAt: snap.docs[i].data().createdAt })) });
}

/** POST { chatId, uid, approve: boolean } — принять или отклонить заявку. */
export async function POST(req: NextRequest) {
  const me = await requireMessenger(req);
  if ("error" in me) return me.error;
  const b = await req.json().catch(() => ({}));
  const loaded = await loadChat(b.chatId, me.uid);
  if ("error" in loaded) return loaded.error;
  if (!canDo(loaded.chat, me.uid, "inviteUsers")) return fail("Нет доступа", 403);
  if (typeof b.uid !== "string" || !b.uid || b.uid.includes("/")) return fail("uid обязателен");
  const db = adminDb();
  const reqRef = db.collection("messengerJoinRequests").doc(`${loaded.chat.id}_${b.uid}`);
  if (!(await reqRef.get()).exists) return fail("Заявка не найдена", 404);
  if (b.approve === true && !loaded.chat.members.includes(b.uid)) {
    const max = loaded.chat.type === "channel" ? 5000 : 200;
    if (loaded.chat.members.length >= max) return fail("В чате нет мест", 403);
    await db.collection("messengerChats").doc(loaded.chat.id).update({ members: FieldValue.arrayUnion(b.uid) });
  }
  await reqRef.delete();
  return NextResponse.json({ ok: true });
}
