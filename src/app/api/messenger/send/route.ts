import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { rateLimit } from "@/lib/rateLimit";
import { Action, canDo, cleanMediaMeta, fail, isDmBlocked, isOwnMediaUrl, isChatAdmin, loadChat, ownsMedia, postMessage, previewOf, requireMessenger } from "@/lib/messenger/server";
import { MAX_MESSAGE_TEXT, MessageKind, MessengerStickerPack } from "@/lib/messenger/types";
import { isPremium } from "@/lib/messenger/premium";

export const runtime = "nodejs";

const NEED: Record<string, Action> = { text: "sendMessages", image: "sendMedia", voice: "sendMedia", videoNote: "sendMedia", file: "sendMedia", sticker: "sendStickers", poll: "sendPolls" };

/**
 * POST { chatId, kind?: "text"|"image"|"voice"|"videoNote"|"file"|"sticker"|"poll", text?, mediaUrl?, duration?, waveform?, width?, height?,
 *        stickerPack?, stickerIndex?, poll?: { question, options: string[], multiple?, anonymous?, quiz?: { correct, explanation? } },
 *        replyTo?: msgId, silent?: boolean } -> { id }
 * voice/videoNote/file: mediaUrl загружен самим отправителем (messenger/<uid>/..., см. upload-ticket).
 * Права группы, медленный режим, блокировки и «только админы» в канале проверяются здесь.
 */
export async function POST(req: NextRequest) {
  const me = await requireMessenger(req);
  if ("error" in me) return me.error;
  if (!(await rateLimit(`msgr_send_${me.uid}`, 20, 60_000))) return fail("Слишком часто, подожди немного", 429);

  const b = await req.json().catch(() => ({}));
  const loaded = await loadChat(b.chatId, me.uid);
  if ("error" in loaded) return loaded.error;
  const { chat } = loaded;

  const kind: MessageKind = b.kind in NEED ? b.kind : "text";
  if (!canDo(chat, me.uid, NEED[kind])) return fail(chat.type === "channel" ? "В канале пишут только админы" : "Тебе запрещено отправлять это в группе", 403);
  if (await isDmBlocked(chat, me.uid)) return fail("Нельзя писать этому пользователю", 403);

  const text = typeof b.text === "string" ? b.text.trim() : "";
  if (text.length > MAX_MESSAGE_TEXT) return fail(`Сообщение длиннее ${MAX_MESSAGE_TEXT} символов`);

  const db = adminDb();
  let mediaUrl: string | undefined;
  let extra: Record<string, unknown> = cleanMediaMeta(b, kind);
  let postText: string | undefined = text || undefined;
  let quizSecret: { correct: number; explanation: string } | null = null;

  if (kind === "text") {
    if (!text) return fail("Пустое сообщение");
  } else if (kind === "poll") {
    const p = b.poll ?? {};
    const question = String(p.question ?? "").trim();
    const options: string[] = Array.isArray(p.options) ? p.options.map((o: unknown) => String(o ?? "").trim()) : [];
    if (question.length < 1 || question.length > 255) return fail("Вопрос — от 1 до 255 символов");
    if (options.length < 2 || options.length > 10 || options.some((o) => o.length < 1 || o.length > 100)) return fail("В опросе от 2 до 10 вариантов (до 100 символов)");
    const quiz = !!p.quiz;
    if (quiz) {
      const correct = Number(p.quiz.correct);
      if (!Number.isInteger(correct) || correct < 0 || correct >= options.length) return fail("Укажи правильный вариант викторины");
      quizSecret = { correct, explanation: String(p.quiz.explanation ?? "").slice(0, 200) };
    }
    extra = { poll: { question, options: options.map((t) => ({ text: t, count: 0 })), multiple: !quiz && p.multiple === true, anonymous: p.anonymous !== false, quiz, closed: false, total: 0 } };
    postText = question;
  } else if (kind === "sticker") {
    // POST { kind:"sticker", stickerPack: slug, stickerIndex: n } — набор добавлен у отправителя; премиум-набор — только с Mili Premium
    const slug = typeof b.stickerPack === "string" ? b.stickerPack : "";
    const idx = Number.isInteger(b.stickerIndex) ? b.stickerIndex : -1;
    if (!/^[a-z0-9_]{3,32}$/.test(slug)) return fail("Набор стикеров не найден", 404);
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

  // Медленный режим: обычный участник может писать раз в N секунд (админы и создатель не ограничены)
  if (chat.slowModeSec && chat.type === "group" && !isChatAdmin(chat, me.uid)) {
    const ref = db.collection("messengerChats").doc(chat.id).collection("slow").doc(me.uid);
    const last = ((await ref.get()).data()?.at as number | undefined) ?? 0;
    const wait = Math.ceil((last + chat.slowModeSec * 1000 - Date.now()) / 1000);
    if (wait > 0) return NextResponse.json({ error: `Медленный режим: подожди ещё ${wait} с`, retryAfterSec: wait }, { status: 429 });
    await ref.set({ at: Date.now() });
  }

  let replyTo: { msgId: string; from: string; preview: string } | undefined;
  if (typeof b.replyTo === "string" && b.replyTo && !b.replyTo.includes("/")) {
    const m = await db.collection("messengerChats").doc(chat.id).collection("messages").doc(b.replyTo).get();
    if (m.exists && !m.data()!.deletedForAll) replyTo = { msgId: m.id, from: m.data()!.from, preview: previewOf(m.data()!.kind, m.data()!.text) };
  }

  const id = await postMessage({ chat, sender: me, kind, text: postText, mediaUrl, replyTo, extra, silent: b.silent === true });
  if (quizSecret) await db.collection("messengerChats").doc(chat.id).collection("messages").doc(id).collection("secret").doc("quiz").set(quizSecret);
  return NextResponse.json({ id });
}
