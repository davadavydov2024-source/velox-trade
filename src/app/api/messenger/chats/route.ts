import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { rateLimit } from "@/lib/rateLimit";
import { dmChatId, fail, requireMessenger, uidByHandle } from "@/lib/messenger/server";

export const runtime = "nodejs";

/** Создать чат. dm: { type:"dm", memberHandles:[handle] } (свой handle = «Избранное»); group: { type:"group", title, memberHandles:[...] }. */
export async function POST(req: NextRequest) {
  const me = await requireMessenger(req);
  if ("error" in me) return me.error;
  if (!(await rateLimit(`msgr_chats_${me.uid}`, 20, 60 * 60_000))) return fail("Слишком много новых чатов за час", 429);

  const b = await req.json().catch(() => ({}));
  const handles: string[] = Array.isArray(b.memberHandles)
    ? (Array.from(new Set(b.memberHandles.map((h: unknown) => String(h).toLowerCase().replace(/^@/, "")))) as string[])
    : [];
  if (handles.length === 0 || handles.length > 100) return fail("Укажи от 1 до 100 участников");

  const uids: string[] = [];
  for (const h of handles) {
    const u = await uidByHandle(h);
    if (!u) return fail(`Пользователь @${h} не найден`, 404);
    if (!uids.includes(u)) uids.push(u);
  }
  const db = adminDb();
  const now = Date.now();

  if (b.type === "dm") {
    if (uids.length !== 1) return fail("В личном чате один собеседник");
    const chatId = dmChatId(me.uid, uids[0]);
    const ref = db.collection("messengerChats").doc(chatId);
    if (!(await ref.get()).exists) {
      await ref.set({ type: "dm", members: Array.from(new Set([me.uid, uids[0]])), admins: [], createdBy: me.uid, updatedAt: now, readBy: {}, pinnedMessageIds: [] });
    }
    return NextResponse.json({ chatId });
  }

  if (b.type === "group") {
    const title = String(b.title ?? "").trim();
    if (title.length < 2 || title.length > 60) return fail("Название группы — от 2 до 60 символов");
    const members = Array.from(new Set([me.uid, ...uids]));
    const ref = db.collection("messengerChats").doc();
    await ref.set({ type: "group", title, members, admins: [me.uid], createdBy: me.uid, updatedAt: now, readBy: {}, pinnedMessageIds: [] });
    return NextResponse.json({ chatId: ref.id });
  }
  return fail("Тип чата: dm или group");
}
