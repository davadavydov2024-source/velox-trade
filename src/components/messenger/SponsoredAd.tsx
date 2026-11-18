"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { authedFetch } from "@/lib/authedFetch";
import { safeImageSrc } from "@/lib/safeImage";
import type { PublicAd } from "@/lib/messenger/ads";

const send = (id: string, event: "view" | "click") => { authedFetch("/api/messenger/ads", { method: "POST", body: JSON.stringify({ id, event }) }).catch(() => {}); };

/** Карточка рекламы (картинка или видео + текст + кнопка). Всегда с пометкой «Реклама». */
export function AdCard({ ad, compact, onHide, preview }: { ad: PublicAd; compact?: boolean; onHide?: () => void; preview?: boolean }) {
  const logged = useRef(false);
  useEffect(() => {
    if (preview || logged.current) return;
    logged.current = true;
    send(ad.id, "view");
  }, [ad.id, preview]);

  const media = ad.mediaKind === "video"
    // eslint-disable-next-line jsx-a11y/media-has-caption
    ? <video src={ad.mediaUrl} autoPlay muted loop playsInline className="w-full h-full object-cover" />
    // eslint-disable-next-line @next/next/no-img-element
    : <img src={safeImageSrc(ad.mediaUrl)} alt="" className="w-full h-full object-cover" draggable={false} />;
  const open = (e: React.MouseEvent) => { if (preview) { e.preventDefault(); return; } send(ad.id, "click"); };
  const btn = (
    <a href={preview ? undefined : ad.buttonUrl} target="_blank" rel="noopener noreferrer sponsored nofollow" onClick={open} onPointerDown={(e) => e.stopPropagation()}
      className="block text-center rounded-full font-semibold active:scale-[0.98] transition-transform" style={{ background: "var(--mx-accent)", color: "#fff", padding: compact ? "7px 14px" : "10px 16px", fontSize: compact ? 14 : 15, whiteSpace: "nowrap" }}>{ad.buttonText}</a>
  );

  if (compact) {
    return (
      <div className="rounded-2xl flex items-center gap-3 p-2.5" style={{ background: "rgba(30,30,30,0.92)", color: "#fff", backdropFilter: "blur(12px)" }} onClick={(e) => e.stopPropagation()}>
        <div className="w-14 h-14 rounded-xl overflow-hidden shrink-0 bg-black">{media}</div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] uppercase tracking-wide opacity-60 leading-none mb-1">Реклама</p>
          <p className="text-[14.5px] font-semibold truncate leading-tight">{ad.title}</p>
          {ad.text && <p className="text-[12.5px] opacity-75 truncate">{ad.text}</p>}
        </div>
        {btn}
        {onHide && <button onClick={onHide} className="w-7 h-7 flex items-center justify-center opacity-60 shrink-0" aria-label="Скрыть"><X size={16} /></button>}
      </div>
    );
  }
  return (
    <div className="mx-4 my-3 mx-auto" style={{ maxWidth: 420, width: "calc(100% - 24px)" }}>
      <div className="rounded-2xl overflow-hidden" style={{ background: "var(--mx-surface)", border: "1px solid var(--mx-line)" }}>
        <div className="flex items-center justify-between px-3.5 pt-2.5 pb-1.5">
          <span className="text-[11.5px] uppercase tracking-wide font-semibold" style={{ color: "var(--mx-accent)" }}>Реклама</span>
          {onHide && <button onClick={onHide} className="mx-muted -mr-1.5 w-7 h-7 flex items-center justify-center" aria-label="Скрыть"><X size={16} /></button>}
        </div>
        <div className="w-full bg-black" style={{ aspectRatio: "16 / 10" }}>{media}</div>
        <div className="px-3.5 pt-2.5 pb-3 flex flex-col gap-1.5">
          <p className="text-[16px] font-bold leading-snug">{ad.title}</p>
          {ad.text && <p className="text-[14px] mx-muted leading-snug whitespace-pre-wrap">{ad.text}</p>}
          <div className="pt-1.5">{btn}</div>
          <p className="text-[11.5px] mx-muted pt-0.5">Рекламу не видят подписчики Mili Premium</p>
        </div>
      </div>
    </div>
  );
}

// Реклама меняется не чаще раза в минуту на одно место — иначе каждое открытие чата дёргало бы сервер
const cache: Record<string, { at: number; ad: PublicAd | null }> = {};

/** Рекламное место: placement="channel" — внизу ленты канала, "viewer" — под фото в просмотрщике. */
export function SponsoredAd({ placement, compact }: { placement: "channel" | "viewer"; compact?: boolean }) {
  const [ad, setAd] = useState<PublicAd | null>(null);
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    let live = true;
    const c = cache[placement];
    if (c && Date.now() - c.at < 60_000) { setAd(c.ad); return; }
    authedFetch(`/api/messenger/ads?placement=${placement}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { const a = (d?.ad ?? null) as PublicAd | null; cache[placement] = { at: Date.now(), ad: a }; if (live) setAd(a); })
      .catch(() => {});
    return () => { live = false; };
  }, [placement]);
  if (!ad || hidden) return null;
  return <AdCard ad={ad} compact={compact} onHide={() => setHidden(true)} />;
}
