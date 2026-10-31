import type { MessengerSticker, StickerKind } from "./types";

/** Тип стикера по ссылке: .json — Lottie (бывший .tgs из Telegram), .webm/.mp4 — видео-стикер, остальное — картинка (в т.ч. анимированные GIF/WEBP). */
export function stickerKindOf(url: string): StickerKind {
  if (/\.json(\?|#|$)/i.test(url)) return "lottie";
  if (/\.(webm|mp4)(\?|#|$)/i.test(url)) return "video";
  return "image";
}

/** Что показывать в статичных местах (вкладки наборов, каталог): превью, а если его нет и это картинка — сам файл. */
export function stickerStill(s: Pick<MessengerSticker, "url" | "preview" | "kind">): string | undefined {
  if (s.preview) return s.preview;
  return (s.kind ?? stickerKindOf(s.url)) === "image" ? s.url : undefined;
}

export const isAnimatedSticker = (s: Pick<MessengerSticker, "url" | "kind">) => (s.kind ?? stickerKindOf(s.url)) !== "image";
