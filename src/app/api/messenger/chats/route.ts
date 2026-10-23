import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { rateLimit } from "@/lib/rateLimit";
import { dmChatId, fail, HANDLE_RE, SERVICE_UID, requireMessenger, uidByHandle } from "@/lib/messenger/server";

export const runtime = "nodejs";

/**
 * Создать чат.
 *  dm:      { type:"dm", memberHandles:[handle] }  (свой handle = «Избранное»)
 *  group:   { type:"group", title, memberHandles:[...] }
 *  channel: { type:"channel", title, description?, handle?, memberHandles?:[...] }
 *           handle задан — публичный канал (@handle, поиск, вход по ссылке); без handle — приватный (вход по пригласительной ссылке).
 */
export async function POST(req: NextRequest) {
  const me = await requireMessenger(req);
  if ("error" in me) return me.error;
  if (!(await rateLimit(`msgr_chats_${me.uid}`, 20, 60 * 60_000))) return fail("Слишком много новых чатов за час", 429);

  const b = await req.json().catch(() => ({}));
  const handles: string[] = Array.isArray(b.memberHandles)
    ? (Array.from(new Set(b.memberHandles.map((h: unknown) => String(h).toLowerCase().replace(/^@/, "")))) as string[])
    : [];
  if (handles.length > 200) return fail("Не больше 200 участников при создании");
  if (b.type !== "channel" && handles.length === 0) return fail("Укажи хотя бы одного участника");

  const uids: string[] = [];
  for (const h of handles) {
    const u = await uidByHandle(h);
    if (!u) return fail(`Пользователь @${h} не найден`, 404);
    if (!uids.includes(u)) uids.push(u);
  }
  if (uids.includes(SERVICE_UID)) return fail("Это служебный аккаунт — ему писать нельзя", 403);
  const db = adminDb();
  const now = Date.now();

  if (b.type === "dm") {
    if (uids.length !== 1) return fail("В личном чате один собеседник");
    const chatId = dmChatId(me.uid, uids[0]);
    const ref = db.collection("messengerChats").doc(chatId);
    if (!(await ref.get()).exists) {
      const target = (await db.collection("messengerAccounts").doc(uids[0]).get()).data();
      if (uids[0] !== me.uid && (!target || target.banned)) return fail("Пользователь недоступен", 404);
      if (uids[0] !== me.uid && target?.privacy?.whoCanMessage === "nobody") return fail("Этот пользователь не принимает новые сообщения", 403);
      await ref.set({ type: "dm", members: Array.from(new Set([me.uid, uids[0]])), admins: [], createdBy: me.uid, updatedAt: now, readBy: {}, pinnedMessageIds: [] });
    }
    return NextResponse.json({ chatId });
  }

  if (b.type === "group" || b.type === "channel") {
    const title = String(b.title ?? "").trim();
    if (title.length < 2 || title.length > 60) return fail("Название — от 2 до 60 символов");
    const description = String(b.description ?? "").slice(0, 300);
    const accDocs = uids.length ? await db.getAll(...uids.map((u) => db.collection("messengerAccounts").doc(u))) : [];
    const allowed = uids.filter((_, i) => accDocs[i].data()?.privacy?.whoCanAddToGroups !== "nobody"); // уважаем приватность
    const members = Array.from(new Set([me.uid, ...allowed]));
    const ref = db.collection("messengerChats").doc();
    const base = { type: b.type, title, description, members, admins: [me.uid], createdBy: me.uid, updatedAt: now, readBy: {}, pinnedMessageIds: [] };

    const handle = b.type === "channel" && b.handle ? String(b.handle).trim().toLowerCase().replace(/^@/, "") : "";
    if (handle) {
      if (!HANDLE_RE.test(handle)) return fail("@адрес канала: 4–24 символа, латиница, цифры и _, начинается с буквы");
      const hRef = db.collection("messengerHandles").doc(handle);
      try {
        await db.runTransaction(async (tx) => {
          if ((await tx.get(hRef)).exists) throw new Error("handle-taken");
          tx.set(hRef, { chatId: ref.id, kind: "channel" });
          tx.set(ref, { ...base, handle });
        });
      } catch (e: any) {
        if (e?.message === "handle-taken") return fail("Этот адрес уже занят", 409);
        throw e;
      }
    } else {
      await ref.set(base);
    }
    return NextResponse.json({ chatId: ref.id });
  }
  return fail("Тип чата: dm, group или channel");
}
