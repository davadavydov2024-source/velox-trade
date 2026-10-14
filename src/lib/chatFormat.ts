// Telegram-подобная разметка для чатов. Пользователь меток НЕ видит — редактор (components/FormatInput)
// показывает оформление прямо в поле ввода, а в Firestore в поле text лежит строка с метками:
//   **жирный**  ^^курсив^^  __подчёркнутый__  ~~зачёркнутый~~  `моно`  ||скрытый||  и "> цитата" в начале строки.
// Спецсимволы, которые человек набрал сам, экранируются обратным слэшем (см. lib/chatEditorDom.ts),
// поэтому случайно набранное "||" или "**" не превращается в форматирование.
// Ссылки в разметке не поддерживаются; ссылки в тексте показываются некликабельно с предупреждением.

export type FormatKind = "bold" | "italic" | "underline" | "strike" | "quote" | "mono" | "spoiler" | "clear";

const MARKERS: [string, "bold" | "italic" | "underline" | "strike" | "spoiler" | "mono"][] = [
  ["**", "bold"],
  ["^^", "italic"],
  ["__", "underline"],
  ["~~", "strike"],
  ["||", "spoiler"],
  ["`", "mono"],
];

/** Символы, перед которыми обратный слэш означает "это обычный символ". */
export const ESC_SET = "\\*^_~|`>";

export type InlineNode =
  | { t: "text"; v: string }
  | { t: "mono"; v: string }
  | { t: "fmt"; k: "bold" | "italic" | "underline" | "strike" | "spoiler"; c: InlineNode[] };

function unescape(s: string): string {
  return s.replace(/\\([\\*^_~|`>])/g, "$1");
}

/** Ищет закрывающий маркер, пропуская экранированные символы. */
function findClose(s: string, m: string, from: number): number {
  for (let j = from; j < s.length; j++) {
    if (s[j] === "\\" && j + 1 < s.length && ESC_SET.includes(s[j + 1])) {
      j++;
      continue;
    }
    if (s.startsWith(m, j)) return j;
  }
  return -1;
}

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
    if (s[i] === "\\" && i + 1 < s.length && ESC_SET.includes(s[i + 1])) {
      buf += s[i + 1];
      i += 2;
      continue;
    }
    let matched = false;
    for (const [m, k] of MARKERS) {
      if (!s.startsWith(m, i)) continue;
      const end = findClose(s, m, i + m.length);
      if (end > i + m.length) {
        const inner = s.slice(i + m.length, end);
        flush();
        out.push(k === "mono" ? { t: "mono", v: unescape(inner) } : { t: "fmt", k, c: parseInline(inner) });
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

// ---- Обычный текст (превью в списках, push, toast) ----

function flatten(nodes: InlineNode[], hide: boolean): string {
  return nodes
    .map((n) => (n.t === "text" || n.t === "mono" ? n.v : n.k === "spoiler" && hide ? "▒▒▒▒" : flatten(n.c, hide)))
    .join("");
}

/** Текст без разметки. hideSpoilers — скрытое заменяется на ▒▒▒▒ (для превью, push, Telegram-fallback). */
export function toPlain(text: string, opts: { hideSpoilers?: boolean } = {}): string {
  return parseBlocks(text)
    .map((b) => b.lines.map((l) => flatten(parseInline(l), !!opts.hideSpoilers)).join("\n"))
    .join("\n");
}

/** Короткое превью для списков чатов/уведомлений: без разметки, скрытое спрятано, обрезано до max символов. */
export function previewText(text: string, max = 200): string {
  const plain = toPlain(text, { hideSpoilers: true });
  return plain.length > max ? `${plain.slice(0, max)}…` : plain;
}

export const stripFormatting = (s: string) => toPlain(s);

// ---- Telegram (parse_mode HTML) ----

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const TG_TAG: Record<string, string> = { bold: "b", italic: "i", underline: "u", strike: "s", spoiler: "tg-spoiler" };

interface Budget {
  n: number;
  cut: boolean;
}

function renderTg(nodes: InlineNode[], budget: Budget): string {
  let out = "";
  for (const node of nodes) {
    if (budget.n <= 0) {
      budget.cut = true;
      break;
    }
    if (node.t === "text" || node.t === "mono") {
      let v = node.v;
      if (v.length > budget.n) {
        v = v.slice(0, budget.n);
        budget.cut = true;
      }
      budget.n -= v.length;
      out += node.t === "mono" ? `<code>${esc(v)}</code>` : esc(v);
    } else {
      const inner = renderTg(node.c, budget);
      if (!inner) continue;
      const tag = TG_TAG[node.k];
      out += `<${tag}>${inner}</${tag}>`;
    }
  }
  return out;
}

/**
 * Разметка сообщения -> HTML для Telegram. Всё экранируется, из тегов используются только наши
 * (b, i, u, s, code, blockquote, tg-spoiler) — ссылок (<a>) получиться не может. Скрытый текст уходит
 * как tg-spoiler, то есть в боте он скрыт до нажатия. Длина обрезается по ВИДИМЫМ символам, теги
 * при обрезке закрываются правильно, так что скрытое не может "протечь" из-за оборванного маркера.
 */
export function toTelegramHtml(text: string, maxPlain = 200): string {
  const budget: Budget = { n: maxPlain, cut: false };
  const parts: string[] = [];
  for (const b of parseBlocks(text)) {
    if (budget.n <= 0) {
      budget.cut = true;
      break;
    }
    const lines: string[] = [];
    for (const l of b.lines) {
      if (budget.n <= 0) {
        budget.cut = true;
        break;
      }
      lines.push(renderTg(parseInline(l), budget));
      budget.n -= 1; // перенос строки
    }
    const body = lines.join("\n");
    parts.push(b.type === "quote" ? `<blockquote>${body}</blockquote>` : body);
  }
  return parts.join("\n").trim() + (budget.cut ? "…" : "");
}

export function escapeHtml(s: string): string {
  return esc(s);
}

// ---- Ссылки ----
export const LINK_RE_SOURCE = String.raw`(?:https?:\/\/|www\.)[^\s]+|\bt\.me\/[^\s]+|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|ru|org|net|io|me|gg|su|xyz|tk|cc|ly|to|app|site|online|link|click|shop|store|info|biz|co|by|ua|kz|fun|top|pro|club|live|vip)\b(?:\/[^\s]*)?`;

export function hasLink(text: string): boolean {
  const re = new RegExp(LINK_RE_SOURCE, "i");
  return re.test(text) || re.test(toPlain(text));
}
