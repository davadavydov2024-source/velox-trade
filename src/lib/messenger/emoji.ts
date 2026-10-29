/** Сообщение из 1–3 эмодзи (без другого текста) показываем крупно и с анимацией, как в Telegram. */
const EMOJI_RE = new RegExp("^(?:\\p{Extended_Pictographic}(?:\\uFE0F|\\u200D\\p{Extended_Pictographic}|[\\u{1F3FB}-\\u{1F3FF}])*\\uFE0F?){1,3}$", "u");

export function bigEmojiOf(text: string | undefined | null): string | null {
  const t = (text ?? "").replace(/\s+/g, "");
  if (!t || t.length > 24) return null;
  return EMOJI_RE.test(t) ? t : null;
}
