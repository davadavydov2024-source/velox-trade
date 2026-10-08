import { doc, updateDoc } from "firebase/firestore";
import { db } from "./firebase";

/**
 * Учёт прочтения чатов. В документе чата (orderChats / directConversations / tickets) лежит
 * readBy: { [uid]: мс } — «этот человек прочитал всё до этого момента». Из него считаются:
 *  • бейджи «непрочитано» у получателя;
 *  • отметка «Прочитано» (две галочки) у отправителя.
 *
 * Сообщения старше этой даты никогда не считаются непрочитанными — иначе после выкатки все
 * старые переписки разом засветились бы десятками «новых» сообщений.
 */
export const UNREAD_TRACKING_START = 1791417600000; // 2026-10-08 00:00 UTC

export type ReadBy = Record<string, number> | undefined;

/** Сколько сообщений от других пришло после того, как я последний раз открывал чат. */
export function countUnread<T extends { createdAt: number }>(messages: T[], isFromOther: (m: T) => boolean, myReadAt: number | undefined): number {
  const since = Math.max(myReadAt ?? 0, UNREAD_TRACKING_START);
  let n = 0;
  for (const m of messages) if (m.createdAt > since && isFromOther(m)) n++;
  return n;
}

/** Время последнего прочтения среди перечисленных собеседников (для «Прочитано» у отправителя). */
export function peerReadAt(readBy: ReadBy, peerKeys: string[]): number {
  if (!readBy) return 0;
  return peerKeys.reduce((max, k) => Math.max(max, readBy[k] ?? 0), 0);
}

type ChatCollection = "orderChats" | "directConversations" | "tickets";

/**
 * Отмечает чат прочитанным до момента lastMessageAt. Берём max(сейчас, время сообщения): у людей
 * часы расходятся, и если часы читателя отстают от отправителя, одно «сейчас» оказалось бы раньше
 * сообщения — оно бы вечно оставалось непрочитанным. Ошибки глотаем: отметка прочтения — не
 * критичная функция, из-за неё нельзя ронять чат (например, если правила Firestore не пускают).
 */
export async function markChatRead(col: ChatCollection, id: string, readerKey: string, lastMessageAt: number) {
  try {
    await updateDoc(doc(db, col, id), { [`readBy.${readerKey}`]: Math.max(Date.now(), lastMessageAt) });
  } catch {
    // нет прав / документа ещё нет — просто не отмечаем
  }
}
