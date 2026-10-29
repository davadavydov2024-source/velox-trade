"use client";

import { useState } from "react";
import { EMOJI_GROUPS } from "./util";
import { StickerPanel } from "./StickersUI";

/** Панель эмодзи под полем ввода (как в Telegram): вкладки-группы сверху, сетка эмодзи. */
export function EmojiPanel({ onPick, onSticker, height = 280 }: { onPick: (emoji: string) => void; onSticker?: (pack: string, index: number) => void; height?: number }) {
  const [group, setGroup] = useState(0);
  const [tab, setTab] = useState<"emoji" | "stickers">("emoji");
  if (onSticker && tab === "stickers") {
    return (
      <div className="flex flex-col" style={{ height, background: "var(--mx-surface)", borderTop: "1px solid var(--mx-line)" }}>
        <div className="flex gap-1 px-2 pt-1 shrink-0">
          <button onClick={() => setTab("emoji")} className="flex-1 py-1.5 rounded-lg text-[14px] font-semibold mx-muted">Эмодзи</button>
          <button className="flex-1 py-1.5 rounded-lg text-[14px] font-semibold" style={{ background: "var(--mx-surface2)" }}>Стикеры</button>
        </div>
        <div className="flex-1 min-h-0"><StickerPanel onPick={onSticker} height={height - 40} /></div>
      </div>
    );
  }
  return (
    <div className="flex flex-col" style={{ height, background: "var(--mx-surface)", borderTop: "1px solid var(--mx-line)" }}>
      {onSticker && (
        <div className="flex gap-1 px-2 pt-1 shrink-0">
          <button className="flex-1 py-1.5 rounded-lg text-[14px] font-semibold" style={{ background: "var(--mx-surface2)" }}>Эмодзи</button>
          <button onClick={() => setTab("stickers")} className="flex-1 py-1.5 rounded-lg text-[14px] font-semibold mx-muted">Стикеры</button>
        </div>
      )}
      <div className="flex px-2 pt-1 gap-1 shrink-0">
        {EMOJI_GROUPS.map((g, i) => (
          <button
            key={g.label}
            onClick={() => setGroup(i)}
            className="flex-1 py-1.5 rounded-lg text-[20px]"
            style={{ background: i === group ? "var(--mx-surface2)" : "transparent" }}
            aria-label={g.label}
          >
            {g.icon}
          </button>
        ))}
      </div>
      <div className="mx-scroll flex-1 px-2 py-1 grid content-start" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(42px, 1fr))" }}>
        {EMOJI_GROUPS[group].items.map((e) => (
          <button key={e} onClick={() => onPick(e)} className="h-11 text-[26px] rounded-lg active:bg-white/10">
            {e}
          </button>
        ))}
      </div>
    </div>
  );
}
