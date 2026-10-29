"use client";

import { useState } from "react";
import { EMOJI_GROUPS } from "./util";

/** Панель эмодзи под полем ввода (как в Telegram): вкладки-группы сверху, сетка эмодзи. */
export function EmojiPanel({ onPick, height = 280 }: { onPick: (emoji: string) => void; height?: number }) {
  const [group, setGroup] = useState(0);
  return (
    <div className="flex flex-col" style={{ height, background: "var(--vc-surface)", borderTop: "1px solid var(--vc-line)" }}>
      <div className="flex px-2 pt-1 gap-1 shrink-0">
        {EMOJI_GROUPS.map((g, i) => (
          <button
            key={g.label}
            onClick={() => setGroup(i)}
            className="flex-1 py-1.5 rounded-lg text-[20px]"
            style={{ background: i === group ? "var(--vc-surface2)" : "transparent" }}
            aria-label={g.label}
          >
            {g.icon}
          </button>
        ))}
      </div>
      <div className="vc-scroll flex-1 px-2 py-1 grid content-start" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(42px, 1fr))" }}>
        {EMOJI_GROUPS[group].items.map((e) => (
          <button key={e} onClick={() => onPick(e)} className="h-11 text-[26px] rounded-lg active:bg-white/10">
            {e}
          </button>
        ))}
      </div>
    </div>
  );
}
