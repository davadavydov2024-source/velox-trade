import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";
import { rateLimit } from "@/lib/rateLimit";
import { fail, requireMessenger } from "@/lib/messenger/server";
import { createJoinRequest } from "@/lib/messenger/joinRequests";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Находит канал, показанный в чьём-то профиле (по chatId или по @адресу). Чужие каналы, которых нет в профилях, не отдаём. */
async function findShownChannel(chatId: string, handle: string) {
  const db = adminDb();
  let id = chatId;
  if (!id && handle) {
    const h = (await db.collection("messengerHandles").doc(handle.toLowerCase().replace(/^@/, "")).get()).data();
    if (h?.kind === "channel") id = h.chatId as string;
  }
  if (!id || id.includes("/")) return null;
  const byId = await db.collection("messengerAccounts").where("profileChannel", "==", id).limit(1).get();
  let shown = !byId.empty;
  if (!shown && handle) shown = !(await db.collection("messengerAccounts").where("channelHandle", "==", handle.toLowerCase().replace(/^@/, "")).limit(1).get()).empty;
  if (!shown) return null;
  const ref = db.collection("messengerChats").doc(id);
  const chat = (await ref.get()).data();
  if (!chat || chat.type !== "channel") return null;
  return { id, ref, chat };
}

/** GET ?chatId= | ?handle= — карточка канала из профиля + что может сделать смотрящий: открыть / подписаться / подать заявку / заявка уже отправлена. */
export async function GET(req: NextRequest) {
  const me = await requireMessenger(req);
  if ("error" in me) return me.error;
  const sp = req.nextUrl.searchParams;
  const found = await findShownChannel(sp.get("chatId") ?? "", sp.get("handle") ?? "");
  if (!found) return fail("Канал не найден", 404);
  const { id, ref, chat } = found;
  const members = (chat.members as string[]) ?? [];
  const isMember = members.includes(me.uid);
  const isPrivate = !chat.handle || !!chat.joinByRequest;
  let mode: "member" | "join" | "request" | "requested" = "join";
  if (isMember) mode = "member";
  else if (isPrivate) mode = (await adminDb().collection("messengerJoinRequests").doc(`${id}_${me.uid}`).get()).exists ? "requested" : "request";
  let lastText = "";
  if (!isPrivate) {
    const last = await ref.collection("messages").orderBy("createdAt", "desc").limit(1).get();
    const m = last.docs[0]?.data();
    if (m && !m.deletedForAll) lastText = m.text || (m.kind === "image" ? "Фото" : "Публикация");
  }
  return NextResponse.json({
    chatId: id, title: chat.title ?? "Канал", photoURL: chat.photoURL ?? null, description: chat.description ?? "",
    subscribers: members.length, handle: chat.handle ?? null, isPrivate, mode, lastText,
  });
}

/** POST { chatId } — подписаться (публичный канал) или подать заявку (закрытый: админам канала уйдёт сообщение с кнопками «Принять / Отклонить»). */
export async function POST(req: NextRequest) {
  const me = await requireMessenger(req);
  if ("error" in me) return me.error;
  if (!(await rateLimit(`msgr_pchan_${me.uid}`, 20, 60 * 60_000))) return fail("Слишком часто, попробуй позже", 429);
  const b = await req.json().catch(() => ({}));
  const found = await findShownChannel(typeof b.chatId === "string" ? b.chatId : "", "");
  if (!found) return fail("Канал не найден", 404);
  const { id, ref, chat } = found;
  const members = (chat.members as string[]) ?? [];
  if (members.includes(me.uid)) return NextResponse.json({ already: true });
  if ((chat.banned as string[] | undefined)?.includes(me.uid)) return fail("Тебе закрыт доступ в этот канал", 403);
  if (members.length >= 5000) return fail("В канале нет мест", 403);
  const isPrivate = !chat.handle || !!chat.joinByRequest;
  if (!isPrivate) {
    await ref.update({ members: FieldValue.arrayUnion(me.uid) });
    return NextResponse.json({ joined: true });
  }
  const reqRef = adminDb().collection("messengerJoinRequests").doc(`${id}_${me.uid}`);
  if ((await reqRef.get()).exists) return NextResponse.json({ requested: true, already: true });
  await createJoinRequest(id, chat as { title?: string; createdBy: string; admins?: string[] }, { uid: me.uid, displayName: me.account.displayName, handle: me.account.handle });
  return NextResponse.json({ requested: true });
}
