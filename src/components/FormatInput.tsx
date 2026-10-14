"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Type } from "lucide-react";
import { FormatKind } from "@/lib/chatFormat";
import { domToMarkup, markupToDom, makeQuote, makeSpan } from "@/lib/chatEditorDom";

// Пункта "Добавить ссылку" здесь намеренно нет — ссылки в форматировании не поддерживаются.
const ITEMS: { kind: FormatKind; label: string; shortcut: string; cls?: string }[] = [
  { kind: "bold", label: "Жирный", shortcut: "Ctrl+B", cls: "font-bold" },
  { kind: "italic", label: "Курсив", shortcut: "Ctrl+I", cls: "italic" },
  { kind: "underline", label: "Подчёркнутый", shortcut: "Ctrl+U", cls: "underline" },
  { kind: "strike", label: "Зачёркнутый", shortcut: "Ctrl+Shift+X", cls: "line-through" },
  { kind: "quote", label: "Цитата", shortcut: "Ctrl+Shift+." },
  { kind: "mono", label: "Моноширинный", shortcut: "Ctrl+Shift+M", cls: "font-mono" },
  { kind: "spoiler", label: "Скрытый", shortcut: "Ctrl+Shift+P" },
  { kind: "clear", label: "Без форматирования", shortcut: "Ctrl+Shift+N" },
];

function kindFromKey(e: React.KeyboardEvent): FormatKind | null {
  if (!(e.ctrlKey || e.metaKey)) return null;
  if (!e.shiftKey) {
    if (e.code === "KeyB") return "bold";
    if (e.code === "KeyI") return "italic";
    if (e.code === "KeyU") return "underline";
    return null;
  }
  if (e.code === "KeyX") return "strike";
  if (e.code === "Period") return "quote";
  if (e.code === "KeyM") return "mono";
  if (e.code === "KeyP") return "spoiler";
  if (e.code === "KeyN") return "clear";
  return null;
}

type MenuState = null | "button" | { x: number; y: number };

const closest = (node: Node | null, root: HTMLElement, sel: string): HTMLElement | null => {
  let n: Node | null = node;
  while (n && n !== root) {
    if (n.nodeType === 1 && (n as HTMLElement).matches(sel)) return n as HTMLElement;
    n = n.parentNode;
  }
  return null;
};

function unwrap(el: HTMLElement): { first: Node | null; last: Node | null } {
  const parent = el.parentNode!;
  const first = el.firstChild;
  const last = el.lastChild;
  while (el.firstChild) parent.insertBefore(el.firstChild, el);
  parent.removeChild(el);
  return { first, last };
}

function selectBetween(first: Node | null, last: Node | null) {
  if (!first || !last) return;
  const sel = window.getSelection();
  if (!sel) return;
  const r = document.createRange();
  r.setStartBefore(first);
  r.setEndAfter(last);
  sel.removeAllRanges();
  sel.addRange(r);
}

export function FormatInput({
  value,
  onChange,
  placeholder,
  className = "",
  style,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const lastEmitted = useRef<string>("");
  const savedRange = useRef<Range | null>(null);
  const [menu, setMenu] = useState<MenuState>(null);

  // Внешнее изменение value (очистка после отправки, подстановка команды) — перерисовываем редактор.
  useEffect(() => {
    const root = ref.current;
    if (!root || value === lastEmitted.current) return;
    lastEmitted.current = value;
    markupToDom(value, root);
    if (value) {
      root.focus();
      const sel = window.getSelection();
      const r = document.createRange();
      r.selectNodeContents(root);
      r.collapse(false);
      sel?.removeAllRanges();
      sel?.addRange(r);
    }
  }, [value]);

  // Запоминаем выделение: на телефонах нажатие на кнопку меню может его сбросить.
  useEffect(() => {
    const onSel = () => {
      const root = ref.current;
      const sel = window.getSelection();
      if (!root || !sel || sel.rangeCount === 0) return;
      if (root.contains(sel.anchorNode)) savedRange.current = sel.getRangeAt(0).cloneRange();
    };
    document.addEventListener("selectionchange", onSel);
    return () => document.removeEventListener("selectionchange", onSel);
  }, []);

  const emit = useCallback(() => {
    const root = ref.current;
    if (!root) return;
    // Браузеры оставляют в пустом поле <br> — из-за него не показывается подсказка.
    if (root.textContent === "" && !root.querySelector("[data-f]") && root.innerHTML !== "") root.innerHTML = "";
    const md = domToMarkup(root);
    lastEmitted.current = md;
    onChange(md);
  }, [onChange]);

  // Enter отправляет сообщение (как и раньше в обычном поле), Shift+Enter — перенос строки.
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const onBefore = (e: InputEvent) => {
      if (e.inputType === "insertParagraph") {
        e.preventDefault();
        root.closest("form")?.requestSubmit();
      }
    };
    root.addEventListener("beforeinput", onBefore);
    return () => root.removeEventListener("beforeinput", onBefore);
  }, []);

  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(null);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenu(null);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  function currentRange(root: HTMLElement): Range | null {
    const sel = window.getSelection();
    if (!sel) return null;
    if (sel.rangeCount === 0 || !root.contains(sel.anchorNode)) {
      if (!savedRange.current) return null;
      sel.removeAllRanges();
      sel.addRange(savedRange.current);
    }
    return sel.rangeCount ? sel.getRangeAt(0) : null;
  }

  function toggleSpan(root: HTMLElement, range: Range, kind: "mono" | "spoiler") {
    const existing = closest(range.commonAncestorContainer, root, `[data-f="${kind}"]`);
    if (existing) {
      const { first, last } = unwrap(existing);
      selectBetween(first, last);
      return;
    }
    if (range.collapsed) return;
    // Выделение, захватывающее цитату целиком, не оборачиваем — получилась бы цитата внутри строки.
    if (range.cloneContents().querySelector('[data-f="quote"]')) return;
    if (closest(range.startContainer, root, '[data-f="quote"]') !== closest(range.endContainer, root, '[data-f="quote"]')) return;
    const frag = range.extractContents();
    frag.querySelectorAll(`[data-f="${kind}"]`).forEach((n) => unwrap(n as HTMLElement));
    const el = makeSpan(document, kind);
    el.appendChild(frag);
    range.insertNode(el);
    const sel = window.getSelection()!;
    const r = document.createRange();
    r.selectNodeContents(el);
    sel.removeAllRanges();
    sel.addRange(r);
  }

  function topChild(root: HTMLElement, node: Node): Node | null {
    let n: Node | null = node;
    while (n && n.parentNode !== root) n = n.parentNode;
    return n;
  }

  function toggleQuote(root: HTMLElement, range: Range) {
    const isQ = (n: Node | null) => !!n && n.nodeType === 1 && (n as HTMLElement).getAttribute("data-f") === "quote";
    if (root.childNodes.length === 0) {
      const q = makeQuote(document);
      q.appendChild(document.createElement("br"));
      root.appendChild(q);
      const r = document.createRange();
      r.setStart(q, 0);
      r.collapse(true);
      const sel = window.getSelection()!;
      sel.removeAllRanges();
      sel.addRange(r);
      return;
    }
    let s = topChild(root, range.startContainer);
    let e = topChild(root, range.endContainer);
    if (!s || !e) return;

    const span: Node[] = [];
    for (let n: Node | null = s; n; n = n.nextSibling) {
      span.push(n);
      if (n === e) break;
    }
    if (span.some(isQ)) {
      // Уже цитата — снимаем.
      span.filter(isQ).forEach((q) => {
        const next = q.nextSibling;
        const { first, last } = unwrap(q as HTMLElement);
        if (next && next.nodeName !== "BR" && last) last.parentNode!.insertBefore(document.createElement("br"), next);
        if (first) selectBetween(first, last);
      });
      return;
    }
    // Расширяем до границ строки (до <br> или соседней цитаты).
    while (s.previousSibling && s.previousSibling.nodeName !== "BR" && !isQ(s.previousSibling)) s = s.previousSibling;
    while (e.nextSibling && e.nextSibling.nodeName !== "BR" && !isQ(e.nextSibling)) e = e.nextSibling;
    const q = makeQuote(document);
    root.insertBefore(q, s);
    for (let n: Node | null = s; n; ) {
      const next: Node | null = n === e ? null : n.nextSibling;
      q.appendChild(n);
      n = next;
    }
    if (q.nextSibling && q.nextSibling.nodeName === "BR") q.parentNode!.removeChild(q.nextSibling);
    const r = document.createRange();
    r.selectNodeContents(q);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(r);
  }

  function clearFormatting(root: HTMLElement, range: Range) {
    if (range.collapsed) {
      const r = document.createRange();
      r.selectNodeContents(root);
      const sel = window.getSelection()!;
      sel.removeAllRanges();
      sel.addRange(r);
      range = r;
    }
    document.execCommand("removeFormat");
    root.querySelectorAll("[data-f]").forEach((n) => {
      if (range.intersectsNode(n)) {
        const el = n as HTMLElement;
        const wasQuote = el.getAttribute("data-f") === "quote";
        const next = el.nextSibling;
        const { last } = unwrap(el);
        if (wasQuote && next && next.nodeName !== "BR" && last) last.parentNode!.insertBefore(document.createElement("br"), next);
      }
    });
  }

  function run(kind: FormatKind) {
    const root = ref.current;
    if (!root) return;
    root.focus();
    const range = currentRange(root);
    if (!range) {
      setMenu(null);
      return;
    }
    document.execCommand("styleWithCSS", false, "false");
    if (kind === "bold") document.execCommand("bold");
    else if (kind === "italic") document.execCommand("italic");
    else if (kind === "underline") document.execCommand("underline");
    else if (kind === "strike") document.execCommand("strikeThrough");
    else if (kind === "mono" || kind === "spoiler") toggleSpan(root, range, kind);
    else if (kind === "quote") toggleQuote(root, range);
    else if (kind === "clear") clearFormatting(root, range);
    setMenu(null);
    emit();
  }

  const menuPos =
    menu && menu !== "button"
      ? {
          position: "fixed" as const,
          left: Math.max(8, Math.min(menu.x, window.innerWidth - 266)),
          top: Math.max(8, Math.min(menu.y, window.innerHeight - 330)),
        }
      : undefined;

  return (
    <div className="relative flex-1 min-w-0">
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label={placeholder}
        data-placeholder={placeholder}
        spellCheck
        className={`${className} w-full pr-10 min-h-[2.5rem] max-h-32 overflow-y-auto whitespace-pre-wrap break-words outline-none empty:before:content-[attr(data-placeholder)] empty:before:text-white/30 empty:before:pointer-events-none`}
        style={style}
        onInput={emit}
        onKeyDown={(e) => {
          const kind = kindFromKey(e);
          if (kind) {
            e.preventDefault();
            run(kind);
          }
        }}
        onPaste={(e) => {
          // Вставляем только простой текст — чужое оформление и ссылки из буфера не попадают в чат.
          e.preventDefault();
          const text = e.clipboardData.getData("text/plain").replace(/\r\n?/g, "\n");
          text.split("\n").forEach((line, i) => {
            if (i > 0) document.execCommand("insertLineBreak");
            if (line) document.execCommand("insertText", false, line);
          });
        }}
        onContextMenu={(e) => {
          const sel = window.getSelection();
          if (sel && !sel.isCollapsed && ref.current?.contains(sel.anchorNode)) {
            e.preventDefault();
            setMenu({ x: e.clientX, y: e.clientY });
          }
        }}
      />
      <button
        type="button"
        title="Форматирование"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setMenu((m) => (m === "button" ? null : "button"))}
        className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full flex items-center justify-center text-white/40 hover:text-white transition-colors"
      >
        <Type size={15} />
      </button>

      {menu && (
        <div
          ref={menuRef}
          style={menuPos}
          className={`z-50 w-[250px] bg-surface border border-border rounded-xl shadow-card p-1.5 ${menu === "button" ? "absolute bottom-full right-0 mb-2" : ""}`}
        >
          {ITEMS.map((it) => (
            <div key={it.kind}>
              {it.kind === "clear" && <div className="h-px bg-border my-1" />}
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => run(it.kind)}
                className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg text-sm hover:bg-white/5 text-left"
              >
                <span className={it.cls}>{it.label}</span>
                <span className="hidden sm:inline text-[11px] text-white/30 shrink-0">{it.shortcut}</span>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
