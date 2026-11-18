/** Реклама в мессенджере (как «спонсорские сообщения» в Telegram): картинка или видео + текст + кнопка со ссылкой. Создаёт только админ. */
export interface MessengerAd {
  id: string;
  title: string; // рекламодатель / заголовок
  text: string;
  mediaUrl: string;
  mediaKind: "image" | "video";
  buttonText: string;
  buttonUrl: string;
  channel: boolean; // показывать внизу каналов
  viewer: boolean; // показывать при просмотре фото
  active: boolean;
  endsAt?: number; // после этого времени не показывается
  views: number;
  clicks: number;
  createdAt: number;
}

export type PublicAd = Pick<MessengerAd, "id" | "title" | "text" | "mediaUrl" | "mediaKind" | "buttonText" | "buttonUrl">;

export const AD_LIMITS = { title: 60, text: 300, button: 24, url: 500 } as const;

/** Только https-ссылки (без javascript:, data: и т.п.). */
export function isSafeAdUrl(u: unknown): u is string {
  if (typeof u !== "string" || u.length > AD_LIMITS.url) return false;
  try { const x = new URL(u); return x.protocol === "https:" && !!x.hostname.includes("."); } catch { return false; }
}
