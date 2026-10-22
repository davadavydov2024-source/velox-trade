/** Типы мессенджера — единственный источник правды для бэкенда (сессия A) и интерфейса (сессия B). */

export type ChatType = "dm" | "group" | "channel";
export type MessageKind = "text" | "image" | "voice" | "videoNote" | "file" | "system";

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
