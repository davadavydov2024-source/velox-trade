import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";
import { rateLimit } from "@/lib/rateLimit";
import { fail, loadChat, requireMessenger } from "@/lib/messenger/server";

export const runtime = "nodejs";

/** POST { chatId, msgIds: string[] (≤30) } — засчитать просмотры постов канала (один человек = один просмотр поста). */
export async function POST(req: NextRequest) {
  const me = await requireMessenger(req);
  if ("error" in me) return me.error;
  if (!(await rateLimit(`msgr_chview_${me.uid}`, 60, 60_000))) return NextResponse.json({ ok: true });
  const b = await req.json().catch(() => ({}));
  const loaded = await loadChat(b.chatId, me.uid);
  if ("error" in loaded) return loaded.error;
  if (loaded.chat.type !== "channel") return fail("Просмотры считаются только в каналах");
  const ids: string[] = Array.isArray(b.msgIds) ? b.msgIds.filter((x: unknown) => typeof x === "string" && x && !x.includes("/")).slice(0, 30) : [];
  const col = adminDb().collection("messengerChats").doc(loaded.chat.id).collection("messages");
  let counted = 0;
  await Promise.all(ids.map(async (id) => {
    const msgRef = col.doc(id);
    try {
      await msgRef.collection("views").doc(me.uid).create({ at: Date.now() }); // уже смотрел -> бросит ошибку, пропускаем
      await msgRef.update({ views: FieldValue.increment(1) });
      counted++;
    } catch { /* повторный просмотр или поста уже нет */ }
  }));
  return NextResponse.json({ ok: true, counted });
}
