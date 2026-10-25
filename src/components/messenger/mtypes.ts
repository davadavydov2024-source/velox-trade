/**
 * Типы интерфейса = типы бэкенда (src/lib/messenger/types.ts — единственный источник правды).
 * Короткие алиасы оставлены, чтобы не переписывать все компоненты.
 */
import type {
  MessengerAccount, MessengerChat, MessengerMessage, MessengerUserChat, MessengerFolder, MessengerStory, ChatType, MessageKind,
} from "@/lib/messenger/types";

export type MAccount = MessengerAccount;
export type MChat = MessengerChat;
export type MMessage = MessengerMessage;
export type MUserChat = MessengerUserChat;
export type MFolder = MessengerFolder;
export type MStory = MessengerStory;
export type MChatType = ChatType;
export type MMsgKind = MessageKind;
export type MFolderType = MessengerFolder["includeTypes"][number];

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
