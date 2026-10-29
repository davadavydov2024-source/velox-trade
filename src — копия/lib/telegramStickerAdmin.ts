import { adminDb } from "./firebaseAdmin";
import { sendTelegramMessage, editTelegramMessage, type InlineButton } from "./telegramBot";
import { importTelegramStickerSet, parseStickerSetName } from "./messenger/stickerImport";
import type { MessengerStickerPack } from "./messenger/types";

/**
 * Стикер-паки из Telegram через бота: админ присылает ссылку t.me/addstickers/… (или любой стикер из набора) —
 * бот скачивает набор вместе с анимацией и публикует его в MiliGram. Набор с премиум-эффектами Telegram
 * сразу становится «только для Mili Premium»; это и публикацию можно переключить кнопками под ответом.
 */

export const STICKER_ADMIN_INSTRUCTIONS =
  "🎨 Стикер-пак из Telegram\n\n" +
  "Пришли ссылку на набор, например:\nhttps://t.me/addstickers/AnimatedEmojies\n\n" +
  "Или просто отправь мне любой стикер из нужного набора — я возьму весь набор.\n" +
  "Можно дописать после ссылки слово «premium» (набор только для Mili Premium) или «скрыть» (черновик, без публикации).\n\n" +
  "Анимированные и видео-стикеры (в том числе премиум) сохраняются анимированными.";

const slugOk = (s: string) => /^[a-z0-9_]{3,32}$/.test(s);
const siteBase = () => (process.env.NEXT_PUBLIC_SITE_URL || "https://velox-trade-zeta.vercel.app").trim().replace(/\/+$/, "");
const packUrl = (slug: string) => `${siteBase()}/m?stickers=${slug}`;
const isAnimated = (u: string) => /\.(webm|json)$/i.test(u);

function packText(p: MessengerStickerPack, note?: string): string {
  const anim = p.stickers.filter((s) => isAnimated(s.url)).length;
  return (
    `🎨 «${p.title}»\n` +
    `Стикеров: ${p.stickers.length}${anim ? ` (анимированных: ${anim})` : ""}\n` +
    `Доступ: ${p.premium ? "⭐ только Mili Premium" : "для всех"}\n` +
    `Статус: ${p.published ? "опубликован" : "скрыт (черновик)"}\n\n` +
    `${packUrl(p.slug)}` +
    (note ? `\n\n${note}` : "")
  );
}

function packButtons(p: MessengerStickerPack): InlineButton[][] {
  return [
    [{ text: p.premium ? "⭐ Premium: вкл — сделать для всех" : "⭐ Сделать только для Premium", callback_data: `stk_prem:${p.slug}` }],
    [{ text: p.published ? "🙈 Скрыть набор" : "👁 Опубликовать", callback_data: `stk_pub:${p.slug}` }, { text: "🗑 Удалить", callback_data: `stk_del:${p.slug}` }],
    [{ text: "🔗 Открыть набор", url: packUrl(p.slug) }],
    [{ text: "‹ Админ-меню", callback_data: "admin_menu" }],
  ];
}

/** Импортирует набор и отвечает админу карточкой с кнопками управления. */
export async function importStickerSetFromBot(chatId: number, name: string, extraText = ""): Promise<void> {
  const low = extraText.toLowerCase();
  const wantPremium = /premium|премиум/.test(low) ? true : undefined;
  const wantHidden = /скрыть|черновик|draft/.test(low);
  await sendTelegramMessage(chatId, `⏳ Импортирую набор «${name}»… это может занять до минуты.`);
  const r = await importTelegramStickerSet({ name, createdBy: `tg_admin_${chatId}`, premium: wantPremium, published: wantHidden ? false : undefined });
  if (!r.ok) {
    await sendTelegramMessage(chatId, `❌ ${r.error}`);
    return;
  }
  const notes: string[] = [];
  if (r.reused) notes.push("Этот набор уже был импортирован раньше — показываю существующий.");
  if (r.skipped > 0) notes.push(`Пропущено стикеров (слишком тяжёлые или не скачались): ${r.skipped}.`);
  if (r.premiumEffects > 0) notes.push(`В наборе ${r.premiumEffects} стикеров с премиум-эффектами Telegram: сами стикеры анимированы, а полноэкранный эффект в MiliGram не воспроизводится.`);
  await sendTelegramMessage(chatId, packText(r.pack, notes.join("\n")), packButtons(r.pack));
}

/** Нажатия кнопок «stk_*» под карточкой набора. Возвращает true, если callback наш. */
export async function handleStickerCallback(chatId: number, messageId: number, data: string): Promise<boolean> {
  const m = /^(stk_prem|stk_pub|stk_del|stk_delyes|stk_back):([a-z0-9_]{3,32})$/.exec(data);
  if (!m) return false;
  const [, action, slug] = m;
  if (!slugOk(slug)) return true;
  const ref = adminDb().collection("messengerStickerPacks").doc(slug);
  const pack = (await ref.get()).data() as MessengerStickerPack | undefined;
  if (!pack) {
    await editTelegramMessage(chatId, messageId, "Набор уже удалён.", [[{ text: "‹ Админ-меню", callback_data: "admin_menu" }]]);
    return true;
  }
  if (action === "stk_prem") {
    pack.premium = !pack.premium;
    await ref.update({ premium: pack.premium, updatedAt: Date.now() });
  } else if (action === "stk_pub") {
    pack.published = !pack.published;
    await ref.update({ published: pack.published, updatedAt: Date.now() });
  } else if (action === "stk_del") {
    await editTelegramMessage(chatId, messageId, `Удалить набор «${pack.title}»? Он пропадёт у всех, кто его добавил.`, [
      [{ text: "✅ Да, удалить", callback_data: `stk_delyes:${slug}` }, { text: "↩️ Отмена", callback_data: `stk_back:${slug}` }],
    ]);
    return true;
  } else if (action === "stk_delyes") {
    await ref.delete();
    await editTelegramMessage(chatId, messageId, `🗑 Набор «${pack.title}» удалён.`, [[{ text: "‹ Админ-меню", callback_data: "admin_menu" }]]);
    return true;
  }
  await editTelegramMessage(chatId, messageId, packText(pack), packButtons(pack));
  return true;
}

export { parseStickerSetName };
