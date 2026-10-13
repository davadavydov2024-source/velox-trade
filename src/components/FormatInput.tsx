"use client";

import { useEffect, useRef, useState } from "react";
import { Type } from "lucide-react";
import { applyFormat, FormatKind } from "@/lib/chatFormat";

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
  const ref = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<MenuState>(null);

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

  function run(kind: FormatKind) {
    const el = ref.current;
    if (!el) return;
    const s = el.selectionStart ?? value.length;
    const e = el.selectionEnd ?? s;
    const r = applyFormat(value, s, e, kind);
    onChange(r.text);
    setMenu(null);
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(r.start, r.end);
    }, 0);
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
      <input
        ref={ref}
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`${className} w-full pr-10`}
        style={style}
        onKeyDown={(e) => {
          const kind = kindFromKey(e);
          if (kind) {
            e.preventDefault();
            run(kind);
          }
        }}
        onContextMenu={(e) => {
          const el = e.currentTarget;
          if (el.selectionStart !== el.selectionEnd) {
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
