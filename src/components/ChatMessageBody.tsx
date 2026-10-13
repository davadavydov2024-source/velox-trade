"use client";

import { ReactNode, useState } from "react";
import { AlertTriangle } from "lucide-react";
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

// Ссылки НИКОГДА не превращаются в кликабельные <a> — только подсвечиваются как текст.
function renderPlain(v: string, key: string): ReactNode {
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
