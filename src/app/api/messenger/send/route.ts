import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { rateLimit } from "@/lib/rateLimit";
import { canPost, cleanMediaMeta, fail, isDmBlocked, isOwnMediaUrl, loadChat, ownsMedia, postMessage, previewOf, requireMessenger } from "@/lib/messenger/server";
import { MAX_MESSAGE_TEXT, MessageKind, MessengerStickerPack } from "@/lib/messenger/types";
import { isPremium } from "@/lib/messenger/premium";

export const runtime = "nodejs";

const KINDS: MessageKind[] = ["text", "image", "voice", "videoNote", "file", "sticker"];

/**
 * POST { chatId, kind?: "text"|"image"|"voice"|"videoNote"|"file"|"sticker", text?, mediaUrl?, duration?, waveform?, width?, height?, replyTo?: msgId } -> { id }
 * voice/videoNote/file: mediaUrl обязан быть загружен самим отправителем (путь messenger/<uid>/ — см. upload-ticket).
 */
export async function POST(req: NextRequest) {
  const me = await requireMessenger(req);
  if ("error" in me) return me.error;
  if (!(await rateLimit(`msgr_send_${me.uid}`, 20, 60_000))) return fail("Слишком часто, подожди немного", 429);

  const b = await req.json().catch(() => ({}));
  const loaded = await loadChat(b.chatId, me.uid);
  if ("error" in loaded) return loaded.error;
  const { chat } = loaded;
  const noPost = canPost(chat, me.uid);
  if (noPost) return fail(noPost, 403);
  if (await isDmBlocked(chat, me.uid)) return fail("Нельзя писать этому пользователю", 403);

  const kind: MessageKind = KINDS.includes(b.kind) ? b.kind : "text";
  const text = typeof b.text === "string" ? b.text.trim() : "";
  if (text.length > MAX_MESSAGE_TEXT) return fail(`Сообщение длиннее ${MAX_MESSAGE_TEXT} символов`);

  let mediaUrl: string | undefined;
  let extra: Record<string, unknown> = cleanMediaMeta(b, kind);
  if (kind === "text") {
    if (!text) return fail("Пустое сообщение");
  } else if (kind === "sticker") {
    // POST { kind:"sticker", stickerPack: slug, stickerIndex: n } — набор должен быть добавлен у отправителя; премиум-набор — только с Mili Premium
    const slug = typeof b.stickerPack === "string" ? b.stickerPack : "";
    const idx = Number.isInteger(b.stickerIndex) ? b.stickerIndex : -1;
    if (!/^[a-z0-9_]{3,32}$/.test(slug)) return fail("Набор стикеров не найден", 404);
    const db = adminDb();
    const [packSnap, mineSnap] = await Promise.all([db.collection("messengerStickerPacks").doc(slug).get(), db.collection("messengerUserStickers").doc(me.uid).get()]);
    const pack = packSnap.data() as MessengerStickerPack | undefined;
    if (!pack || !pack.published || !pack.stickers[idx]) return fail("Стикер не найден", 404);
    if (!((mineSnap.data()?.slugs as string[] | undefined) ?? []).includes(slug)) return fail("Сначала добавь этот набор стикеров");
    if (pack.premium && !isPremium(me.account)) return NextResponse.json({ error: "Эти стикеры доступны только с Mili Premium", needPremium: true }, { status: 403 });
    mediaUrl = pack.stickers[idx].url;
    extra = { sticker: { pack: slug, index: idx } };
  } else {
    if (!isOwnMediaUrl(b.mediaUrl)) return fail("Некорректная ссылка на файл");
    if (kind !== "image" && !ownsMedia(b.mediaUrl, me.uid)) return fail("Файл нужно загрузить через мессенджер");
    mediaUrl = b.mediaUrl;
  }

  let replyTo: { msgId: string; from: string; preview: string } | undefined;
  if (typeof b.replyTo === "string" && b.replyTo && !b.replyTo.includes("/")) {
    const m = await adminDb().collection("messengerChats").doc(chat.id).collection("messages").doc(b.replyTo).get();
    if (m.exists && !m.data()!.deletedForAll) replyTo = { msgId: m.id, from: m.data()!.from, preview: previewOf(m.data()!.kind, m.data()!.text) };
  }

  const id = await postMessage({ chat, sender: me, kind, text: text || undefined, mediaUrl, replyTo, extra });
  return NextResponse.json({ id });
}
