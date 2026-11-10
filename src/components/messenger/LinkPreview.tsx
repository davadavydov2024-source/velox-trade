"use client";

import { useEffect, useState } from "react";
import { mApi } from "./api";
import { useMxPrefs } from "./prefs";

interface Preview { url: string; site: string; title: string; description: string; image: string }
const cache = new Map<string, Preview | null>();
const URL_RE = /https?:\/\/[^\s<>"')]+/i;

/** Карточка-превью под сообщением с первой ссылкой (заголовок, описание, картинка). Отключается в Настройках. */
export function LinkPreview({ text }: { text: string }) {
  const enabled = useMxPrefs((s) => s.linkPreviews);
  const url = enabled ? URL_RE.exec(text)?.[0]?.replace(/[.,;!?]+$/, "") : undefined;
  const [p, setP] = useState<Preview | null | undefined>(url ? cache.get(url) : null);

  useEffect(() => {
    if (!url) return;
    if (cache.has(url)) { setP(cache.get(url)); return; }
    let live = true;
    mApi<{ preview: Preview | null }>(`link-preview?url=${encodeURIComponent(url)}`)
      .then((d) => { cache.set(url, d.preview); if (live) setP(d.preview); })
      .catch(() => { cache.set(url, null); });
    return () => { live = false; };
  }, [url]);

  if (!p) return null;
  return (
    <a href={p.url} target="_blank" rel="noopener noreferrer nofollow" className="block mt-1.5 rounded-xl overflow-hidden active:opacity-80" style={{ borderLeft: "3px solid var(--mx-accent)", background: "rgba(127,127,127,0.12)" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {p.image && <img src={p.image} alt="" loading="lazy" referrerPolicy="no-referrer" className="w-full max-h-[180px] object-cover" draggable={false} />}
      <span className="block px-3 py-2">
        <span className="block text-[12.5px] font-semibold" style={{ color: "var(--mx-accent)" }}>{p.site}</span>
        <span className="block text-[14px] font-medium leading-snug line-clamp-2">{p.title}</span>
        {p.description && <span className="block text-[13px] mx-muted leading-snug line-clamp-3">{p.description}</span>}
      </span>
    </a>
  );
}
