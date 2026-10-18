"use client";

import { ReactNode, useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { secretRegex, splitSecretMatch } from "@/lib/chatSecrets";
import { CHAT_HIDE_EVENT } from "@/components/ChatPrivacyShield";
import { InlineNode, LINK_RE_SOURCE, hasLink, parseBlocks, parseInline } from "@/lib/chatFormat";

function Spoiler({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <span
      onClick={() => setOpen(true)}
      className={`rounded px-0.5 ${open ? "" : "cursor-pointer select-none"}`}
      style={{ backgroundColor: open ? "rgba(128,128,128,0.2)" : "rgba(128,128,128,0.6)" }}
      title={open ? undefined : "Нажми, чтобы показать"}
    >
      <span className={open ? "" : "opacity-0"}>{children}</span>
    </span>
  );
}

/** Пароль/код: пока не нажато, значения в DOM вообще нет. После показа сам скрывается через 10 с,
 * при уходе с вкладки и по повторному нажатию. */
function Secret({ value }: { value: string }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => setOpen(false), 10_000);
    const hide = () => setOpen(false);
    window.addEventListener(CHAT_HIDE_EVENT, hide);
    return () => {
      clearTimeout(t);
      window.removeEventListener(CHAT_HIDE_EVENT, hide);
    };
  }, [open]);
  return open ? (
    <span data-allow-copy onClick={() => setOpen(false)} className="rounded px-1 font-mono bg-amber-500/25 cursor-pointer break-all">
      {value}
    </span>
  ) : (
    <button type="button" onClick={() => setOpen(true)} className="select-none rounded px-1.5 bg-white/20 text-[0.85em] align-baseline" title="Нажми, чтобы показать на 10 секунд">
      🔒 •••••• показать
    </button>
  );
}

// Пароли и коды прячем за кнопкой, остальное — как раньше (ссылки только подсвечиваются).
function renderPlain(v: string, key: string): ReactNode {
  const re = secretRegex();
  const parts: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(v))) {
    if (m[0].length === 0) { re.lastIndex++; continue; }
    if (m.index > last) parts.push(renderLinks(v.slice(last, m.index), `${key}-s${m.index}`));
    const { prefix, value } = splitSecretMatch(m);
    if (prefix) parts.push(<span key={`${key}-k${m.index}`}>{prefix}</span>);
    parts.push(<Secret key={`${key}-v${m.index}`} value={value} />);
    last = m.index + m[0].length;
  }
  if (parts.length === 0) return renderLinks(v, key);
  if (last < v.length) parts.push(renderLinks(v.slice(last), `${key}-e`));
  return <span key={key}>{parts}</span>;
}

// Ссылки НИКОГДА не превращаются в кликабельные <a> — только подсвечиваются как текст.
function renderLinks(v: string, key: string): ReactNode {
  const re = new RegExp(LINK_RE_SOURCE, "gi");
  const parts: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(v))) {
    if (m[0].length === 0) {
      re.lastIndex++;
      continue;
    }
    if (m.index > last) parts.push(v.slice(last, m.index));
    parts.push(
      <span key={`${key}-l${m.index}`} className="underline decoration-wavy decoration-red-400 break-all">
        {m[0]}
      </span>
    );
    last = m.index + m[0].length;
  }
  if (parts.length === 0) return v;
  if (last < v.length) parts.push(v.slice(last));
  return <span key={key}>{parts}</span>;
}

function renderNodes(nodes: InlineNode[], key: string): ReactNode[] {
  return nodes.map((n, i) => {
    const k = `${key}-${i}`;
    if (n.t === "text") return <span key={k}>{renderPlain(n.v, k)}</span>;
    if (n.t === "mono")
      return (
        <code key={k} className="font-mono text-[12.5px] px-1 py-0.5 rounded bg-black/25">
          {n.v}
        </code>
      );
    const inner = renderNodes(n.c, k);
    switch (n.k) {
      case "bold":
        return <strong key={k}>{inner}</strong>;
      case "italic":
        return <em key={k}>{inner}</em>;
      case "underline":
        return <u key={k}>{inner}</u>;
      case "strike":
        return <s key={k}>{inner}</s>;
      case "spoiler":
        return <Spoiler key={k}>{inner}</Spoiler>;
    }
  });
}

export function ChatMessageBody({ text, incoming = false, className = "" }: { text: string; incoming?: boolean; className?: string }) {
  const blocks = parseBlocks(text);
  const linkFound = hasLink(text);

  return (
    <div className={className}>
      <div className="whitespace-pre-wrap break-words">
        {blocks.map((b, bi) => {
          const content = b.lines.map((line, li) => (
            <span key={li}>
              {li > 0 && "\n"}
              {renderNodes(parseInline(line), `b${bi}l${li}`)}
            </span>
          ));
          return b.type === "quote" ? (
            <div key={bi} className="my-0.5 pl-2 border-l-2 border-current/60" style={{ borderLeft: "2px solid currentColor" }}>
              <div className="opacity-80">{content}</div>
            </div>
          ) : (
            <span key={bi}>
              {bi > 0 && blocks[bi - 1].type === "p" ? "\n" : ""}
              {content}
            </span>
          );
        })}
      </div>

      {linkFound && incoming && (
        <div className="mt-1.5 flex gap-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 px-2 py-1.5 text-[11px] leading-snug text-amber-200">
          <AlertTriangle size={13} className="shrink-0 mt-px text-amber-400" />
          <span>
            В сообщении есть ссылка. Не переходите по ней и не доверяйте незнакомым ссылкам — так воруют аккаунты и деньги. Не вводите там пароли и коды, а сделку
            проводите только на сайте.
          </span>
        </div>
      )}
    </div>
  );
}
