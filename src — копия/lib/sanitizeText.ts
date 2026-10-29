/** Вырезает ссылки из текста, который пришёл с клиента и уйдёт другому человеку от имени сайта
 * (фишинг от «официального» бота/почты). */
export function stripLinks(text: string, max = 600): string {
  return String(text)
    .replace(/(https?:\/\/|tg:\/\/|www\.)\S+/gi, "[ссылка удалена]")
    .replace(/\b(t\.me|telegram\.me)\/\S*/gi, "[ссылка удалена]")
    .slice(0, max);
}

/** Для писем: оставляем только безопасную вёрстку, убираем скрипты, ссылки, формы и обработчики событий. */
export function sanitizeEmailHtml(html: string, max = 6000): string {
  return String(html)
    .slice(0, max)
    .replace(/<\s*(script|style|iframe|object|embed|form|link|meta|base|svg|img)\b[\s\S]*?(<\/\s*\1\s*>|$)/gi, "")
    .replace(/<\s*\/?\s*a\b[^>]*>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/(href|src|action|formaction)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/javascript:/gi, "")
    .replace(/(https?:\/\/|www\.)\S+/gi, "[ссылка удалена]");
}
