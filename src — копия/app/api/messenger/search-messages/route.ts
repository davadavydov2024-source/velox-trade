import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { rateLimit } from "@/lib/rateLimit";
import { fail, loadChat, requireMessenger } from "@/lib/messenger/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const norm = (s: string) => s.toLowerCase();

/**
 * GET ?q=текст&chatId=(необязательно) — поиск по сообщениям.
 * С chatId: по последним 1000 сообщениям чата. Без chatId: по 15 самым свежим чатам (по 150 сообщений в каждом).
 * (Firestore не умеет полнотекстовый поиск — это поиск по недавней истории; глубокий поиск потребует отдельного сервиса.)
 */
export async function GET(req: NextRequest) {
  const me = await requireMessenger(req);
  if ("error" in me) return me.error;
  if (!(await rateLimit(`msgr_msgsearch_${me.uid}`, 30, 60_000))) return fail("Слишком часто", 429);
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 100);
  if (q.length < 2) return NextResponse.json({ results: [] });
  const needle = norm(q);
  const db = adminDb();
  const chatIdParam = req.nextUrl.searchParams.get("chatId");

  let chatIds: { id: string; depth: number }[] = [];
  if (chatIdParam) {
    const loaded = await loadChat(chatIdParam, me.uid);
    if ("error" in loaded) return loaded.error;
    chatIds = [{ id: loaded.chat.id, depth: 1000 }];
  } else {
    const chats = await db.collection("messengerChats").where("members", "array-contains", me.uid).limit(100).get();
    chatIds = chats.docs.sort((a, b) => (b.data().updatedAt ?? 0) - (a.data().updatedAt ?? 0)).slice(0, 15).map((d) => ({ id: d.id, depth: 150 }));
  }

  const results: { chatId: string; msgId: string; from: string; text: string; createdAt: number }[] = [];
  await Promise.all(chatIds.map(async ({ id, depth }) => {
    const snap = await db.collection("messengerChats").doc(id).collection("messages").orderBy("createdAt", "desc").limit(depth).get();
    for (const d of snap.docs) {
      const m = d.data();
      if (m.deletedForAll || (m.hiddenFor as string[] | undefined)?.includes(me.uid) || typeof m.text !== "string") continue;
      if (norm(m.text).includes(needle)) results.push({ chatId: id, msgId: d.id, from: m.from, text: m.text.slice(0, 200), createdAt: m.createdAt });
    }
  }));
  results.sort((a, b) => b.createdAt - a.createdAt);
  return NextResponse.json({ results: results.slice(0, 50) });
}
