import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { fail, requireMessenger } from "@/lib/messenger/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET ?handle=@канал | ?code=пригласительный — карточка канала/группы до вступления; для публичного канала ещё и последние 20 постов. */
export async function GET(req: NextRequest) {
  const me = await requireMessenger(req);
  if ("error" in me) return me.error;
  const db = adminDb();
  const handle = (req.nextUrl.searchParams.get("handle") ?? "").toLowerCase().replace(/^@/, "");
  const code = req.nextUrl.searchParams.get("code") ?? "";

  let chatId: string | null = null;
  let isPublic = false;
  if (handle) {
    const d = (await db.collection("messengerHandles").doc(handle).get()).data();
    if (d?.kind === "channel") { chatId = d.chatId; isPublic = true; }
  } else if (code && !code.includes("/")) {
    chatId = ((await db.collection("messengerInvites").doc(code).get()).data()?.chatId as string | undefined) ?? null;
  }
  if (!chatId) return fail("Не найдено", 404);
  const snap = await db.collection("messengerChats").doc(chatId).get();
  const c = snap.data();
  if (!c) return fail("Не найдено", 404);

  let posts: unknown[] = [];
  if (isPublic) {
    const ms = await snap.ref.collection("messages").orderBy("createdAt", "desc").limit(20).get();
    posts = ms.docs
      .filter((d) => !d.data().deletedForAll)
      .map((d) => {
        const m = d.data();
        const reactions: Record<string, number> = {};
        Object.entries(m.reactions ?? {}).forEach(([e, u]) => (reactions[e] = (u as string[]).length));
        return { id: d.id, kind: m.kind, text: m.text ?? "", mediaUrl: m.mediaUrl ?? null, createdAt: m.createdAt, views: m.views ?? 0, reactions };
      })
      .reverse();
  }
  return NextResponse.json({
    chatId, type: c.type, title: c.title, description: c.description ?? "", photoURL: c.photoURL ?? null,
    handle: c.handle ?? null, subscribers: (c.members as string[]).length, isMember: (c.members as string[]).includes(me.uid), posts,
  });
}
