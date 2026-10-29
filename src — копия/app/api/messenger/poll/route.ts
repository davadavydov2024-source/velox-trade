import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { rateLimit } from "@/lib/rateLimit";
import { canDo, fail, loadChat, requireMessenger } from "@/lib/messenger/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST { chatId, msgId, action: "vote"|"retract"|"close", options?: number[] }
 *  vote — проголосовать (в опросе с одним ответом — один индекс; можно переголосовать, в викторине — нельзя);
 *  retract — отозвать голос; close — закрыть опрос (автор или админ).
 *  -> для викторины после голоса приходит { correct, explanation }.
 * GET ?chatId=&msgId= — кто как проголосовал (только НЕ анонимные опросы).
 */
export async function POST(req: NextRequest) {
  const me = await requireMessenger(req);
  if ("error" in me) return me.error;
  if (!(await rateLimit(`msgr_poll_${me.uid}`, 60, 60_000))) return fail("Слишком часто", 429);
  const b = await req.json().catch(() => ({}));
  const loaded = await loadChat(b.chatId, me.uid);
  if ("error" in loaded) return loaded.error;
  if (typeof b.msgId !== "string" || !b.msgId || b.msgId.includes("/")) return fail("msgId обязателен");
  const db = adminDb();
  const msgRef = db.collection("messengerChats").doc(loaded.chat.id).collection("messages").doc(b.msgId);
  const voteRef = msgRef.collection("votes").doc(me.uid);

  if (b.action === "close") {
    const m = (await msgRef.get()).data();
    if (!m?.poll) return fail("Опрос не найден", 404);
    if (m.from !== me.uid && !canDo(loaded.chat, me.uid, "editMessages") && !canDo(loaded.chat, me.uid, "deleteMessages")) return fail("Закрыть опрос может автор или админ", 403);
    await msgRef.update({ "poll.closed": true });
    return NextResponse.json({ ok: true });
  }

  try {
    const result = await db.runTransaction(async (tx) => {
      const [msg, vote, secret] = await Promise.all([tx.get(msgRef), tx.get(voteRef), tx.get(msgRef.collection("secret").doc("quiz"))]);
      const poll = msg.data()?.poll;
      if (!poll || msg.data()?.deletedForAll) throw new Error("not-found");
      if (poll.closed) throw new Error("closed");
      const prev: number[] = vote.data()?.options ?? [];
      const counts: number[] = poll.options.map((o: { count: number }) => o.count);

      let next: number[] = [];
      if (b.action === "vote") {
        const raw: unknown[] = Array.isArray(b.options) ? b.options : [];
        next = Array.from(new Set(raw.filter((i): i is number => Number.isInteger(i) && (i as number) >= 0 && (i as number) < counts.length)));
        if (next.length === 0) throw new Error("empty");
        if (!poll.multiple && next.length > 1) throw new Error("single");
        if (poll.quiz && prev.length > 0) throw new Error("quiz-locked");
      } else if (b.action === "retract") {
        if (poll.quiz) throw new Error("quiz-locked");
      } else throw new Error("bad-action");

      prev.forEach((i) => (counts[i] = Math.max(0, counts[i] - 1)));
      next.forEach((i) => (counts[i] += 1));
      const total = (poll.total ?? 0) + (next.length > 0 ? 1 : 0) - (prev.length > 0 ? 1 : 0);
      const updPoll = { ...poll, options: poll.options.map((o: { text: string }, i: number) => ({ text: o.text, count: counts[i] })), total: Math.max(0, total) };
      tx.update(msgRef, { poll: updPoll });
      if (next.length > 0) tx.set(voteRef, { options: next, at: Date.now() });
      else tx.delete(voteRef);
      return poll.quiz && next.length > 0 ? { correct: secret.data()?.correct ?? null, explanation: secret.data()?.explanation ?? "" } : {};
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    const map: Record<string, [string, number]> = {
      "not-found": ["Опрос не найден", 404], closed: ["Опрос закрыт", 400], empty: ["Выбери вариант", 400],
      single: ["В этом опросе можно выбрать один вариант", 400], "quiz-locked": ["В викторине нельзя менять ответ", 400], "bad-action": ["action: vote, retract или close", 400],
    };
    const m = map[e?.message];
    if (m) return fail(m[0], m[1]);
    console.error("poll error:", e);
    return fail("Не удалось проголосовать", 500);
  }
}

export async function GET(req: NextRequest) {
  const me = await requireMessenger(req);
  if ("error" in me) return me.error;
  const loaded = await loadChat(req.nextUrl.searchParams.get("chatId"), me.uid);
  if ("error" in loaded) return loaded.error;
  const msgId = req.nextUrl.searchParams.get("msgId") ?? "";
  if (!msgId || msgId.includes("/")) return fail("msgId обязателен");
  const db = adminDb();
  const msgRef = db.collection("messengerChats").doc(loaded.chat.id).collection("messages").doc(msgId);
  const poll = (await msgRef.get()).data()?.poll;
  if (!poll) return fail("Опрос не найден", 404);
  if (poll.anonymous) return fail("Опрос анонимный", 403);
  const votes = await msgRef.collection("votes").limit(100).get();
  const accs = votes.docs.length ? await db.getAll(...votes.docs.map((v) => db.collection("messengerAccounts").doc(v.id))) : [];
  return NextResponse.json({ voters: accs.map((a, i) => ({ uid: a.id, handle: a.data()?.handle ?? "", displayName: a.data()?.displayName ?? "Пользователь", photoURL: a.data()?.photoURL ?? null, options: votes.docs[i].data().options })) });
}
