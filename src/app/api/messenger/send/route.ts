import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { rateLimit } from "@/lib/rateLimit";
import { fail, isOwnMediaUrl, loadChat, postMessage, previewOf, requireMessenger } from "@/lib/messenger/server";
import { MAX_MESSAGE_TEXT } from "@/lib/messenger/types";

export const runtime = "nodejs";

/** POST { chatId, text?, kind?: "text"|"image", mediaUrl?, replyTo?: msgId } -> { id } */
export async function POST(req: NextRequest) {
  const me = await requireMessenger(req);
  if ("error" in me) return me.error;
  if (!(await rateLimit(`msgr_send_${me.uid}`, 20, 60_000))) return fail("Слишком часто, подожди немного", 429);

  const b = await req.json().catch(() => ({}));
  const loaded = await loadChat(b.chatId, me.uid);
  if ("error" in loaded) return loaded.error;
  const { chat } = loaded;

  const kind = b.kind === "image" ? "image" : "text";
  const text = typeof b.text === "string" ? b.text.trim() : "";
  if (text.length > MAX_MESSAGE_TEXT) return fail(`Сообщение длиннее ${MAX_MESSAGE_TEXT} символов`);
  let mediaUrl: string | undefined;
  if (kind === "image") {
    if (!isOwnMediaUrl(b.mediaUrl)) return fail("Некорректная ссылка на фото");
    mediaUrl = b.mediaUrl;
  } else if (!text) return fail("Пустое сообщение");

  let replyTo: { msgId: string; from: string; preview: string } | undefined;
  if (typeof b.replyTo === "string" && b.replyTo && !b.replyTo.includes("/")) {
    const m = await adminDb().collection("messengerChats").doc(chat.id).collection("messages").doc(b.replyTo).get();
    if (m.exists && !m.data()!.deletedForAll) replyTo = { msgId: m.id, from: m.data()!.from, preview: previewOf(m.data()!.kind, m.data()!.text) };
  }

  const id = await postMessage({ chat, sender: me, kind, text: text || undefined, mediaUrl, replyTo });
  return NextResponse.json({ id });
}
