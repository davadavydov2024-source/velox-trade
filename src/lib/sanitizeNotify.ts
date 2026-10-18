/**
 * Очистка текстов уведомлений, которые клиент просит отправить ДРУГОМУ человеку от имени сайта
 * (Telegram и почта). Без неё любой вошедший пользователь мог бы разослать фишинг «от Velox Trade»
 * со ссылками на посторонние сайты. Админам фильтр не применяется.
 */

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://velox-trade-zeta.vercel.app").replace(/\/+$/, "");

/** Заменяет любые ссылки в тексте (кроме адресов нашего сайта) на заглушку. */
export function stripForeignLinks(text: string): string {
  return text.replace(/(?:https?:\/\/|www\.|t\.me\/|tg:\/\/)[^\s<>"']+/gi, (m) => (m.startsWith(SITE_URL) ? m : "[ссылка удалена]"));
}

export function cleanPlainText(text: unknown, max: number, isAdmin: boolean): string {
  const s = typeof text === "string" ? text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, max) : "";
  return isAdmin ? s : stripForeignLinks(s);
}

/** Тема письма: одна строка без переводов строк (защита от инъекции заголовков). */
export function cleanSubject(subject: unknown): string {
  return typeof subject === "string" ? subject.replace(/[\r\n]+/g, " ").trim().slice(0, 150) : "";
}

const ALLOWED_TAGS = new Set(["b", "i", "strong", "em", "br", "p", "ul", "ol", "li", "h3", "h4", "div", "span"]);

/**
 * HTML письма: оставляем только безобидные теги без атрибутов; ссылки <a> — только на наш сайт;
 * скрипты, стили, iframe, картинки и любые on*-атрибуты вырезаются.
 */
export function sanitizeEmailHtml(html: unknown, isAdmin: boolean): string {
  let s = typeof html === "string" ? html.slice(0, 6000) : "";
  s = s.replace(/<(script|style|iframe|object|embed|svg|math)[\s\S]*?<\/\1>/gi, "");
  let linkOpen = false;
  s = s.replace(/<\/?([a-z][a-z0-9]*)\b([^>]*)>/gi, (full, tag: string, attrs: string) => {
    const name = tag.toLowerCase();
    const closing = full.startsWith("</");
    if (name === "a") {
      if (closing) {
        const was = linkOpen;
        linkOpen = false;
        return was ? "</a>" : "";
      }
      const href = /href\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1] ?? "";
      if (href.startsWith(SITE_URL) || href.startsWith("/")) {
        linkOpen = true;
        return `<a href="${href.startsWith("/") ? SITE_URL + href : href}">`;
      }
      return "";
    }
    if (!ALLOWED_TAGS.has(name)) return "";
    return closing ? `</${name}>` : `<${name}>`;
  });
  return isAdmin ? s : stripForeignLinks(s);
}

/** Обёртка письма: показывает, что это автоматическое уведомление, и предупреждает о мошенничестве. */
export function wrapEmail(body: string): string {
  return `${body}<hr style="border:none;border-top:1px solid #ddd;margin:20px 0"><p style="color:#888;font-size:12px">Автоматическое уведомление Velox Trade. Мы никогда не просим пароль, коды из писем или данные карты.</p>`;
}
