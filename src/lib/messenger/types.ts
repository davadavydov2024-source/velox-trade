/** Типы мессенджера — единственный источник правды для бэкенда (сессия A) и интерфейса (сессия B). */

export type ChatType = "dm" | "group" | "channel";
export type MessageKind = "text" | "image" | "voice" | "videoNote" | "file" | "sticker" | "system";

export interface MessengerAccount {
  uid: string;
  handle: string; // lowercase, 4–24 символа: a-z, 0-9, _
  displayName: string;
  photoURL: string | null;
  bio: string;
  birthday?: string | null;
  createdAt: number;
  lastSeenAt: number;
  showLastSeen: boolean;
  banned: boolean;
  verified?: boolean;
  premiumUntil?: number; // Mili Premium активен, пока premiumUntil > Date.now()
}

export interface MessengerChat {
  id: string;
  type: ChatType;
  members: string[];
  admins: string[];
  title?: string;
  photoURL?: string | null;
  description?: string;
  createdBy: string;
  lastMessage?: { text: string; kind: MessageKind; from: string; at: number };
  updatedAt: number;
  readBy: Record<string, number>;
  pinnedMessageIds: string[];
  handle?: string; // публичный @канал (поиск, вступление по ссылке /m?join=@handle)
  inviteCode?: string; // пригласительная ссылка /m?join=<код>
}

export interface MessengerMessage {
  id: string;
  from: string; // ставит сервер по токену, клиенту доверять нельзя
  kind: MessageKind;
  text?: string;
  mediaUrl?: string;
  mediaUrls?: string[];
  duration?: number;
  waveform?: number[];
  width?: number;
  height?: number;
  replyTo?: { msgId: string; from: string; preview: string };
  forwardedFrom?: { name: string; uid?: string };
  reactions: Record<string, string[]>; // эмодзи -> uid поставивших
  createdAt: number;
  editedAt?: number;
  deletedForAll?: boolean;
  views?: number; // просмотры поста в канале
  sticker?: { pack: string; index: number };
}

/** Личные настройки чата: messengerUserChats/{uid}/chats/{chatId} */
export interface MessengerUserChat {
  unread: number;
  pinned?: boolean;
  pinnedAt?: number;
  archived?: boolean;
  muted?: boolean;
  mutedUntil?: number;
  folderIds?: string[];
}

export const ALLOWED_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🔥", "👎", "🎉"] as const;
export const MAX_MESSAGE_TEXT = 4000;

export interface MessengerFolder {
  id: string;
  name: string;
  emoji?: string;
  order: number;
  includeTypes: ("dm" | "group" | "channel" | "unread")[];
  chatIds?: string[];
}

export interface MessengerStory {
  id: string;
  uid: string;
  kind: "image" | "video";
  mediaUrl: string;
  caption?: string;
  createdAt: number;
  expiresAt: number; // +24 часа
  viewers: string[];
}

export interface MessengerReport {
  id: string;
  reporterUid: string;
  chatId: string;
  msgId: string;
  from: string;
  kind: MessageKind;
  textSnapshot?: string;
  reason: string;
  createdAt: number;
  status: "open" | "resolved";
}

export interface MessengerStickerPack {
  slug: string; // ссылка: /m?stickers=<slug>
  title: string;
  premium: boolean; // добавить и отправлять могут только с Mili Premium
  published: boolean;
  stickers: { url: string; emoji: string }[];
  createdAt: number;
  updatedAt: number;
}
