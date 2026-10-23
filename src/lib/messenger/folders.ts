/**
 * Логика папок (одна для всех экранов, чтобы список и счётчики не расходились).
 * Чат может лежать в НЕСКОЛЬКИХ папках сразу: он попадает в каждую, под правила которой подходит.
 * Новый чат и новое сообщение сразу появляются во всех подходящих папках без ручных действий:
 *  - includeTypes ("dm" | "group" | "channel") — все чаты этого типа, включая новые;
 *  - "unread" — любой чат с непрочитанными (новое сообщение само «закинет» чат в такую папку);
 *  - chatIds / folderIds — чаты, добавленные вручную. Вкладка «Все» = все чаты, кроме архива.
 */
import type { MessengerFolder, MessengerUserChat, ChatType } from "./types";

type ChatLite = { id: string; type: ChatType };
type UserChatLite = Partial<Pick<MessengerUserChat, "unread" | "archived" | "folderIds" | "muted">> | undefined;

export function chatInFolder(folder: Pick<MessengerFolder, "id" | "includeTypes" | "chatIds">, chat: ChatLite, uc: UserChatLite): boolean {
  if (uc?.archived) return false;
  if (folder.chatIds?.includes(chat.id) || uc?.folderIds?.includes(folder.id)) return true;
  const types = folder.includeTypes ?? [];
  if (types.includes(chat.type)) return true;
  return types.includes("unread") && (uc?.unread ?? 0) > 0;
}

export function foldersForChat(folders: MessengerFolder[], chat: ChatLite, uc: UserChatLite): string[] {
  return folders.filter((f) => chatInFolder(f, chat, uc)).map((f) => f.id);
}

/** Счётчик для вкладки папки: сколько чатов с непрочитанным и сколько непрочитанных сообщений (чаты «без звука» не считаем в бейдж). */
export function folderUnread(folder: Pick<MessengerFolder, "id" | "includeTypes" | "chatIds">, chats: ChatLite[], ucs: Record<string, UserChatLite>) {
  let chatsCount = 0;
  let messages = 0;
  for (const c of chats) {
    const uc = ucs[c.id];
    if (!chatInFolder(folder, c, uc) || uc?.muted) continue;
    const n = uc?.unread ?? 0;
    if (n > 0) { chatsCount++; messages += n; }
  }
  return { chats: chatsCount, messages };
}

/** Вкладка «Все»: все чаты, кроме архивных. */
export function allUnread(chats: ChatLite[], ucs: Record<string, UserChatLite>) {
  let chatsCount = 0;
  let messages = 0;
  for (const c of chats) {
    const uc = ucs[c.id];
    if (uc?.archived || uc?.muted) continue;
    const n = uc?.unread ?? 0;
    if (n > 0) { chatsCount++; messages += n; }
  }
  return { chats: chatsCount, messages };
}
