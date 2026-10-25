import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";
import { rateLimit } from "@/lib/rateLimit";
import { fail, requireMessenger } from "@/lib/messenger/server";
import { sendWebPush } from "@/lib/webPushServer";

export const runtime = "nodejs";

/**
 * POST { handle } (публичный канал) или { code } (пригласительная ссылка) — вступить / подписаться.
 * -> { chatId } | { chatId, requested: true } (если вступление по заявке — ждать одобрения админа).
 */
export async function POST(req: NextRequest) {
  const me = await requireMessenger(req);
  if ("error" in me) return me.error;
  if (!(await rateLimit(`msgr_join_chat_${me.uid}`, 30, 60 * 60_000))) return fail("Слишком много вступлений за час", 429);
  const b = await req.json().catch(() => ({}));
  const db = adminDb();

  let chatId: string | null = null;
  if (typeof b.code === "string" && b.code && !b.code.includes("/")) {
    chatId = ((await db.collection("messengerInvites").doc(b.code).get()).data()?.chatId as string | undefined) ?? null;
  } else if (typeof b.handle === "string" && b.handle) {
    const d = (await db.collection("messengerHandles").doc(b.handle.toLowerCase().replace(/^@/, "")).get()).data();
    chatId = d?.kind === "channel" ? (d.chatId as string) : null;
  }
  if (!chatId) return fail("Ссылка недействительна или канал не найден", 404);

  const ref = db.collection("messengerChats").doc(chatId);
  const chat = (await ref.get()).data();
  if (!chat) return fail("Чат не найден", 404);
  const members = chat.members as string[];
  if (members.includes(me.uid)) return NextResponse.json({ chatId, already: true });
  if ((chat.banned as string[] | undefined)?.includes(me.uid)) return fail("Тебе закрыт доступ в этот чат", 403);
  const max = chat.type === "channel" ? 5000 : 200;
  if (members.length >= max) return fail("В чате нет мест", 403);

  if (chat.joinByRequest) {
    await db.collection("messengerJoinRequests").doc(`${chatId}_${me.uid}`).set({ chatId, uid: me.uid, createdAt: Date.now() });
    const admins = Array.from(new Set([chat.createdBy as string, ...((chat.admins as string[]) ?? [])]));
    await Promise.allSettled(admins.map((a) => sendWebPush(a, { title: `Заявка в «${chat.title ?? "чат"}»`, body: `${me.account.displayName} хочет вступить`, url: `/m/app?chat=${chatId}` }, "messages")));
    return NextResponse.json({ chatId, requested: true });
  }
  await ref.update({ members: FieldValue.arrayUnion(me.uid) });
  return NextResponse.json({ chatId });
}
