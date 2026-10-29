import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { rateLimit } from "@/lib/rateLimit";
import { canDo, fail, isDmBlocked, loadChat, postMessage, requireMessenger } from "@/lib/messenger/server";

export const runtime = "nodejs";

/** POST { fromChatId, msgIds: string[] (≤10), toChatIds: string[] (≤5) } — пересылка (текст и фото). */
export async function POST(req: NextRequest) {
  const me = await requireMessenger(req);
  if ("error" in me) return me.error;
  if (!(await rateLimit(`msgr_fwd_${me.uid}`, 10, 60_000))) return fail("Слишком часто", 429);
  const b = await req.json().catch(() => ({}));
  const msgIds: string[] = Array.isArray(b.msgIds) ? b.msgIds.filter((x: unknown) => typeof x === "string" && x && !x.includes("/")).slice(0, 10) : [];
  const toIds: string[] = Array.isArray(b.toChatIds) ? (Array.from(new Set(b.toChatIds as string[])).slice(0, 5)) : [];
  if (msgIds.length === 0 || toIds.length === 0) return fail("Выбери сообщения и чаты");

  const from = await loadChat(b.fromChatId, me.uid);
  if ("error" in from) return from.error;
  if (from.chat.noForwards) return fail("Автор запретил пересылку из этого чата", 403);
  const targets = [];
  for (const id of toIds) {
    const t = await loadChat(id, me.uid);
    if ("error" in t) return t.error;
    if (!canDo(t.chat, me.uid, "sendMessages")) return fail("Тебе нельзя писать в один из выбранных чатов", 403);
    if (await isDmBlocked(t.chat, me.uid)) return fail("Нельзя писать этому пользователю", 403);
    targets.push(t.chat);
  }

  const db = adminDb();
  const col = db.collection("messengerChats").doc(from.chat.id).collection("messages");
  const msgs = (await Promise.all(msgIds.map((id) => col.doc(id).get()))).filter(
    (m) => m.exists && !m.data()!.deletedForAll && ["text", "image", "voice", "videoNote", "file", "sticker"].includes(m.data()!.kind)
  );
  msgs.sort((a, c) => a.data()!.createdAt - c.data()!.createdAt);
  if (msgs.length === 0) return fail("Эти сообщения переслать нельзя");

  const names = new Map<string, string>();
  for (const m of msgs) {
    const d = m.data()!;
    const authorUid: string = d.forwardedFrom?.uid ?? d.from;
    if (names.has(authorUid)) continue;
    names.set(authorUid, d.forwardedFrom?.name ?? (await db.collection("messengerAccounts").doc(authorUid).get()).data()?.displayName ?? "Пользователь");
  }
  for (const chat of targets) {
    for (const m of msgs) {
      const d = m.data()!;
      const authorUid: string = d.forwardedFrom?.uid ?? d.from;
      await postMessage({ chat, sender: me, kind: d.kind, text: d.text, mediaUrl: d.mediaUrl, extra: { ...(d.sticker ? { sticker: d.sticker } : {}), ...(d.duration !== undefined ? { duration: d.duration } : {}), ...(d.waveform ? { waveform: d.waveform } : {}), ...(d.width ? { width: d.width, height: d.height } : {}) }, forwardedFrom: { name: names.get(authorUid)!, uid: authorUid } });
    }
  }
  return NextResponse.json({ ok: true });
}
