import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { rateLimit } from "@/lib/rateLimit";
import { fail, loadChat, requireMessenger } from "@/lib/messenger/server";

export const runtime = "nodejs";

/** POST { chatId, msgId, reason } — пожаловаться на сообщение (попадает в админку). */
export async function POST(req: NextRequest) {
  const me = await requireMessenger(req);
  if ("error" in me) return me.error;
  if (!(await rateLimit(`msgr_report_${me.uid}`, 10, 60 * 60_000))) return fail("Слишком много жалоб за час", 429);
  const b = await req.json().catch(() => ({}));
  const loaded = await loadChat(b.chatId, me.uid);
  if ("error" in loaded) return loaded.error;
  if (typeof b.msgId !== "string" || !b.msgId || b.msgId.includes("/")) return fail("msgId обязателен");
  const reason = String(b.reason ?? "").trim().slice(0, 300);
  if (reason.length < 2) return fail("Опиши причину жалобы");
  const m = (await adminDb().collection("messengerChats").doc(loaded.chat.id).collection("messages").doc(b.msgId).get()).data();
  if (!m) return fail("Сообщение не найдено", 404);
  await adminDb().collection("messengerReports").add({
    reporterUid: me.uid, chatId: loaded.chat.id, msgId: b.msgId, from: m.from, kind: m.kind,
    textSnapshot: typeof m.text === "string" ? m.text.slice(0, 500) : null, reason, createdAt: Date.now(), status: "open",
  });
  return NextResponse.json({ ok: true });
}
