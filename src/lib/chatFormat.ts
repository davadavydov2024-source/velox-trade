// Лёгкая Telegram-подобная разметка для чатов. Хранится в обычном поле text сообщения —
// схему Firestore менять не нужно. Ссылки в разметке НЕ поддерживаются (кнопки "Добавить ссылку"
// нет), а любые ссылки в тексте показываются как обычный нечитаемый-для-клика текст с предупреждением.

export type FormatKind = "bold" | "italic" | "underline" | "strike" | "quote" | "mono" | "spoiler" | "clear";

const MARK: Record<Exclude<FormatKind, "quote" | "clear">, string> = {
  bold: "**",
  italic: "^^",
  underline: "__",
  strike: "~~",
  mono: "`",
  spoiler: "||",
};

const MARKERS: [string, "bold" | "italic" | "underline" | "strike" | "spoiler" | "mono"][] = [
  ["**", "bold"],
  ["^^", "italic"],
  ["__", "underline"],
  ["~~", "strike"],
  ["||", "spoiler"],
  ["`", "mono"],
];

export type InlineNode =
  | { t: "text"; v: string }
  | { t: "mono"; v: string }
  | { t: "fmt"; k: "bold" | "italic" | "underline" | "strike" | "spoiler"; c: InlineNode[] };

export function parseInline(s: string): InlineNode[] {
  const out: InlineNode[] = [];
  let buf = "";
  let i = 0;
  const flush = () => {
    if (buf) {
      out.push({ t: "text", v: buf });
      buf = "";
    }
  };
  while (i < s.length) {
    let matched = false;
    for (const [m, k] of MARKERS) {
      if (!s.startsWith(m, i)) continue;
      const end = s.indexOf(m, i + m.length);
      if (end > i + m.length) {
        const inner = s.slice(i + m.length, end);
        flush();
        out.push(k === "mono" ? { t: "mono", v: inner } : { t: "fmt", k, c: parseInline(inner) });
        i = end + m.length;
        matched = true;
        break;
      }
    }
    if (!matched) {
      buf += s[i];
      i++;
    }
  }
  flush();
  return out;
}

export interface Block {
  type: "p" | "quote";
  lines: string[];
}

export function parseBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  for (const line of text.split("\n")) {
    const isQuote = line.startsWith("> ");
    const type = isQuote ? "quote" : "p";
    const content = isQuote ? line.slice(2) : line;
    const last = blocks[blocks.length - 1];
    if (last && last.type === type) last.lines.push(content);
    else blocks.push({ type, lines: [content] });
  }
  return blocks;
}

export function stripFormatting(s: string): string {
  return s.replace(/\*\*|\^\^|__|~~|\|\||`/g, "").replace(/^> /gm, "");
}

// ---- Ссылки ----
export const LINK_RE_SOURCE = String.raw`(?:https?:\/\/|www\.)[^\s]+|\bt\.me\/[^\s]+|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|ru|org|net|io|me|gg|su|xyz|tk|cc|ly|to|app|site|online|link|click|shop|store|info|biz|co|by|ua|kz|fun|top|pro|club|live|vip)\b(?:\/[^\s]*)?`;

export function hasLink(text: string): boolean {
  const re = new RegExp(LINK_RE_SOURCE, "i");
  return re.test(text) || re.test(stripFormatting(text));
}

// ---- Применение форматирования к выделению в поле ввода ----
export interface EditResult {
  text: string;
  start: number;
  end: number;
}

export function applyFormat(text: string, start: number, end: number, kind: FormatKind): EditResult {
  if (kind === "clear") {
    const [a, b] = start === end ? [0, text.length] : [start, end];
    const cleaned = stripFormatting(text.slice(a, b));
    return { text: text.slice(0, a) + cleaned + text.slice(b), start: a, end: a + cleaned.length };
  }

  if (kind === "quote") {
    const ls = text.lastIndexOf("\n", start - 1) + 1;
    let le = text.indexOf("\n", end);
    if (le === -1) le = text.length;
    const lines = text.slice(ls, le).split("\n");
    const allQuoted = lines.every((l) => l.startsWith("> "));
    const next = lines.map((l) => (allQuoted ? l.slice(2) : "> " + l)).join("\n");
    return { text: text.slice(0, ls) + next + text.slice(le), start: ls, end: ls + next.length };
  }

  const m = MARK[kind];
  const sel = text.slice(start, end);

  // Выделено вместе с маркерами — снимаем
  if (sel.length >= 2 * m.length && sel.startsWith(m) && sel.endsWith(m)) {
    const inner = sel.slice(m.length, sel.length - m.length);
    return { text: text.slice(0, start) + inner + text.slice(end), start, end: start + inner.length };
  }
  // Маркеры стоят вокруг выделения — снимаем
  if (start !== end && text.slice(start - m.length, start) === m && text.slice(end, end + m.length) === m) {
    return {
      text: text.slice(0, start - m.length) + sel + text.slice(end + m.length),
      start: start - m.length,
      end: end - m.length,
    };
  }
  // Оборачиваем (при пустом выделении курсор встаёт между маркерами)
  return { text: text.slice(0, start) + m + sel + m + text.slice(end), start: start + m.length, end: end + m.length };
}
