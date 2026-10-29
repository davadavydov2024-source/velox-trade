import { ESC_SET, parseBlocks, parseInline, InlineNode } from "./chatFormat";

// Преобразование между строкой с метками (то, что хранится в сообщении) и DOM редактора (то, что видит человек).

type Kind = "bold" | "italic" | "underline" | "strike" | "spoiler" | "mono";
const MARK: Record<Kind, string> = { bold: "**", italic: "^^", underline: "__", strike: "~~", spoiler: "||", mono: "`" };

const MONO_STYLE = "font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:0.92em;background:rgba(255,255,255,0.1);border-radius:4px;padding:0 3px";
const SPOILER_STYLE = "background:rgba(255,255,255,0.18);border-radius:4px;padding:0 2px";
const QUOTE_STYLE = "display:block;border-left:2px solid var(--color-accent,#ff9800);padding-left:8px;margin:2px 0;opacity:0.9";

export function makeSpan(doc: Document, kind: "mono" | "spoiler"): HTMLElement {
  const el = doc.createElement(kind === "mono" ? "code" : "span");
  el.setAttribute("data-f", kind);
  el.setAttribute("style", kind === "mono" ? MONO_STYLE : SPOILER_STYLE);
  return el;
}

export function makeQuote(doc: Document): HTMLElement {
  const el = doc.createElement("blockquote");
  el.setAttribute("data-f", "quote");
  el.setAttribute("style", QUOTE_STYLE);
  return el;
}

// ===================== строка -> DOM =====================

function appendNodes(doc: Document, parent: Node, nodes: InlineNode[]) {
  for (const n of nodes) {
    if (n.t === "text") {
      parent.appendChild(doc.createTextNode(n.v));
    } else if (n.t === "mono") {
      const el = makeSpan(doc, "mono");
      el.textContent = n.v;
      parent.appendChild(el);
    } else {
      let el: HTMLElement;
      if (n.k === "spoiler") el = makeSpan(doc, "spoiler");
      else el = doc.createElement({ bold: "b", italic: "i", underline: "u", strike: "s" }[n.k]);
      appendNodes(doc, el, n.c);
      parent.appendChild(el);
    }
  }
}

export function markupToDom(text: string, root: HTMLElement) {
  const doc = root.ownerDocument;
  root.textContent = "";
  for (const b of parseBlocks(text)) {
    const holder: Node = b.type === "quote" ? makeQuote(doc) : root;
    b.lines.forEach((line, i) => {
      if (i > 0) holder.appendChild(doc.createElement("br"));
      appendNodes(doc, holder, parseInline(line));
    });
    if (b.type === "quote") root.appendChild(holder);
  }
  if (root.childNodes.length === 1 && root.firstChild?.nodeName === "BR") root.textContent = "";
}

// ===================== DOM -> строка =====================

type Tok = { t: "lit"; v: string } | { t: "mark"; v: string } | { t: "nl" } | { t: "q" };

function kindsOf(el: HTMLElement): Kind[] {
  const f = el.getAttribute("data-f");
  if (f === "mono" || f === "spoiler") return [f];
  const tag = el.tagName;
  const st = el.style;
  const kinds: Kind[] = [];
  const fw = st?.fontWeight ?? "";
  if (tag === "B" || tag === "STRONG" || fw === "bold" || Number(fw) >= 600) kinds.push("bold");
  if (tag === "I" || tag === "EM" || st?.fontStyle === "italic") kinds.push("italic");
  const deco = `${st?.textDecorationLine ?? ""} ${st?.textDecoration ?? ""}`;
  if (tag === "U" || tag === "INS" || deco.includes("underline")) kinds.push("underline");
  if (tag === "S" || tag === "STRIKE" || tag === "DEL" || deco.includes("line-through")) kinds.push("strike");
  if (tag === "CODE" && !kinds.includes("mono")) kinds.push("mono");
  return kinds;
}

function isQuote(el: Element): boolean {
  return el.getAttribute("data-f") === "quote" || el.tagName === "BLOCKQUOTE";
}

function splitLines(toks: Tok[]): Tok[][] {
  const lines: Tok[][] = [[]];
  for (const t of toks) {
    if (t.t === "nl") lines.push([]);
    else lines[lines.length - 1].push(t);
  }
  return lines;
}

function hasContent(toks: Tok[]): boolean {
  return toks.some((t) => t.t === "lit" && t.v.length > 0);
}

function walk(node: Node, out: Tok[], inMono: boolean) {
  if (node.nodeType === 3) {
    const raw = (node.nodeValue ?? "").replace(/\u00a0/g, " ").replace(/\u200b/g, "");
    raw.split("\n").forEach((part, i) => {
      if (i > 0) out.push({ t: "nl" });
      if (part) out.push({ t: "lit", v: part });
    });
    return;
  }
  if (node.nodeType !== 1) return;
  const el = node as HTMLElement;
  const tag = el.tagName;

  if (tag === "BR") {
    out.push({ t: "nl" });
    return;
  }

  if (isQuote(el)) {
    if (out.length > 0 && out[out.length - 1].t !== "nl") out.push({ t: "nl" });
    const inner: Tok[] = [];
    el.childNodes.forEach((c) => walk(c, inner, inMono));
    const lines = splitLines(inner);
    while (lines.length > 1 && !hasContent(lines[lines.length - 1])) lines.pop();
    lines.forEach((ln, i) => {
      if (i > 0) out.push({ t: "nl" });
      out.push({ t: "q" }, ...ln);
    });
    out.push({ t: "nl" });
    return;
  }

  if (tag === "DIV" || tag === "P") {
    if (out.length > 0 && out[out.length - 1].t !== "nl") out.push({ t: "nl" });
    el.childNodes.forEach((c) => walk(c, out, inMono));
    if (out.length > 0 && out[out.length - 1].t !== "nl") out.push({ t: "nl" });
    return;
  }

  const kinds = inMono ? [] : kindsOf(el);
  const makesMono = kinds.includes("mono");
  const inner: Tok[] = [];
  el.childNodes.forEach((c) => walk(c, inner, inMono || makesMono));

  if (kinds.length === 0 || !hasContent(inner)) {
    out.push(...inner);
    return;
  }
  // Метки не должны пересекать перенос строки — парсер разбирает каждую строку отдельно.
  splitLines(inner).forEach((ln, i) => {
    if (i > 0) out.push({ t: "nl" });
    if (!hasContent(ln)) {
      out.push(...ln);
      return;
    }
    kinds.forEach((k) => out.push({ t: "mark", v: MARK[k] }));
    out.push(...ln);
    [...kinds].reverse().forEach((k) => out.push({ t: "mark", v: MARK[k] }));
  });
}

/** Экранирует только те символы, которые иначе были бы приняты за разметку. */
function serialize(toks: Tok[]): string {
  // Плоская последовательность символов с пометкой, можно ли символ экранировать.
  const chars: { c: string; lit: boolean; lineStart: boolean }[] = [];
  let lineStart = true;
  for (const t of toks) {
    if (t.t === "nl") {
      chars.push({ c: "\n", lit: false, lineStart: false });
      lineStart = true;
    } else if (t.t === "q") {
      for (const c of "> ") chars.push({ c, lit: false, lineStart: false });
      lineStart = false;
    } else {
      for (const c of t.v) chars.push({ c, lit: t.t === "lit", lineStart });
      lineStart = lineStart && t.v.length === 0;
    }
  }
  let out = "";
  for (let i = 0; i < chars.length; i++) {
    const { c, lit, lineStart: ls } = chars[i];
    if (!lit) {
      out += c;
      continue;
    }
    const prev = i > 0 ? chars[i - 1].c : "";
    const next = i + 1 < chars.length ? chars[i + 1].c : "";
    let escape = false;
    if (c === "`") escape = true;
    else if (c === "\\") escape = ESC_SET.includes(next) && next !== "";
    else if ("*^_~|".includes(c)) escape = prev === c || next === c;
    else if (c === ">") escape = ls;
    out += escape ? "\\" + c : c;
  }
  return out;
}

export function domToMarkup(root: HTMLElement): string {
  const toks: Tok[] = [];
  root.childNodes.forEach((c) => walk(c, toks, false));
  while (toks.length && toks[toks.length - 1].t === "nl") toks.pop();
  return serialize(toks);
}
