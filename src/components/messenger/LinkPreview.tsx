"use client";

import { useEffect, useState } from "react";
import { mApi } from "./api";

export interface LinkPreviewData {
  url: string;
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
}

// кэш на время сессии вкладки: одна и та же ссылка в разных сообщениях грузится один раз
const cache = new Map<string, LinkPreviewData | null>();
const inFlight = new Map<string, Promise<LinkPreviewData | null>>();

function fetchPreview(url: string): Promise<LinkPreviewData | null> {
  if (cache.has(url)) return Promise.resolve(cache.get(url) ?? null);
  const existing = inFlight.get(url);
  if (existing) return existing;
  const p = mApi<{ preview: LinkPreviewData | null }>(`linkpreview?url=${encodeURIComponent(url)}`)
    .then((d) => {
      cache.set(url, d.preview ?? null);
      return d.preview ?? null;
    })
    .catch(() => {
      cache.set(url, null);
      return null;
    })
    .finally(() => inFlight.delete(url));
  inFlight.set(url, p);
  return p;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * Карточка-превью первой ссылки в тексте сообщения (заголовок, описание, картинка сайта) — как в Telegram.
 * Пока грузится — лёгкий скелет; если у страницы нет og-тегов — просто ничего не показываем.
 */
export function LinkPreviewCard({ url, mine }: { url: string; mine: boolean }) {
  const [data, setData] = useState<LinkPreviewData | null | undefined>(cache.has(url) ? cache.get(url) ?? null : undefined);

  useEffect(() => {
    let dead = false;
    if (cache.has(url)) {
      setData(cache.get(url) ?? null);
      return;
    }
    fetchPreview(url).then((d) => {
      if (!dead) setData(d);
    });
    return () => {
      dead = true;
    };
  }, [url]);

  if (data === null) return null;

  if (data === undefined) {
    return (
      <div className="mx-link-preview" data-mine={mine || undefined} aria-hidden>
        <span className="mx-link-preview-bar" />
        <span className="flex-1 min-w-0 py-0.5">
          <span className="mx-skel block" style={{ height: 10, width: "38%", borderRadius: 5 }} />
          <span className="mx-skel block mt-1.5" style={{ height: 9, width: "68%", borderRadius: 5 }} />
        </span>
      </div>
    );
  }

  return (
    <a
      href={data.url}
      target="_blank"
      rel="noreferrer noopener nofollow"
      onClick={(e) => e.stopPropagation()}
      className="mx-link-preview"
      data-mine={mine || undefined}
    >
      <span className="mx-link-preview-bar" />
      <span className="flex-1 min-w-0 py-0.5">
        <span className="block text-[12.5px] font-bold truncate">{data.siteName || hostOf(data.url)}</span>
        {data.title && (
          <span className="block text-[13.5px] font-semibold leading-snug mt-0.5" style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
            {data.title}
          </span>
        )}
        {data.description && (
          <span className="block text-[12.5px] leading-snug mt-0.5 opacity-80" style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
            {data.description}
          </span>
        )}
      </span>
      {data.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={data.image}
          alt=""
          className="mx-link-preview-img"
          loading="lazy"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
      )}
    </a>
  );
}
