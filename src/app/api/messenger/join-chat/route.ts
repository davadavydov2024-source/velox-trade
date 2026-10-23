import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";
import { rateLimit } from "@/lib/rateLimit";
import { fail, requireMessenger } from "@/lib/messenger/server";

export const runtime = "nodejs";

/** POST { handle } (публичный канал) или { code } (пригласительная ссылка) — вступить / подписаться. -> { chatId } */
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
  if ((chat.members as string[]).includes(me.uid)) return NextResponse.json({ chatId, already: true });
  const max = chat.type === "channel" ? 5000 : 200;
  if ((chat.members as string[]).length >= max) return fail("В чате нет мест", 403);
  await ref.update({ members: FieldValue.arrayUnion(me.uid) });
  return NextResponse.json({ chatId });
}
