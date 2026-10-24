/**
 * Типы мессенджера на стороне интерфейса (сессия B). Повторяют раздел 3 контракта.
 * Когда сессия A отдаст src/lib/messenger/types.ts — можно заменить этот файл реэкспортом оттуда.
 */
export type MChatType = "dm" | "group" | "channel";
export type MMsgKind = "text" | "image" | "voice" | "videoNote" | "file" | "system";

export interface MAccount {
  uid: string;
  handle: string;
  displayName: string;
  photoURL?: string | null;
  bio?: string;
  birthday?: string;
  createdAt: number;
  lastSeenAt?: number;
  showLastSeen?: boolean;
  banned?: boolean;
  verified?: boolean;
}

export interface MChat {
  id: string;
  type: MChatType;
  members: string[];
  admins: string[];
  title?: string;
  photoURL?: string | null;
  description?: string;
  createdBy: string;
  lastMessage?: { text: string; kind: MMsgKind; from: string; at: number };
  updatedAt: number;
  readBy?: Record<string, number>;
  pinnedMessageIds?: string[];
}

export interface MMessage {
  id: string;
  from: string;
  kind: MMsgKind;
  text?: string;
  mediaUrl?: string;
  mediaUrls?: string[];
  duration?: number;
  waveform?: number[];
  width?: number;
  height?: number;
  replyTo?: { msgId: string; from: string; preview: string };
  forwardedFrom?: { name: string; uid?: string };
  reactions?: Record<string, string[]>;
  createdAt: number;
  editedAt?: number;
  deletedForAll?: boolean;
}

export interface MUserChat {
  pinned?: boolean;
  pinnedAt?: number;
  archived?: boolean;
  muted?: boolean;
  mutedUntil?: number;
  folderIds?: string[];
  unread?: number;
}

export type MFolderType = "dm" | "group" | "channel" | "unread";

export interface MFolder {
  id: string;
  name: string;
  emoji?: string;
  order: number;
  includeTypes?: MFolderType[];
  chatIds?: string[];
}

export interface MStory {
  id: string;
  uid: string;
  kind: "image" | "video";
  mediaUrl: string;
  caption?: string;
  createdAt: number;
  expiresAt: number;
  viewers?: string[];
}

/** Сообщение, которое отправляется прямо сейчас (показываем сразу, до ответа сервера). */
export interface MPending {
  tempId: string;
  chatId: string;
  kind: MMsgKind;
  text?: string;
  mediaUrl?: string;
  mediaUrls?: string[];
  duration?: number;
  waveform?: number[];
  createdAt: number;
  status: "sending" | "failed";
  progress?: number;
  retry?: () => void;
}
