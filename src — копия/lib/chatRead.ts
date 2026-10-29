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

// ───────── Локальная отметка прочтения (на этом устройстве) ─────────
// Бейдж «непрочитано» должен пропадать СРАЗУ, как только человек открыл чат, и не зависеть от того,
// дошла ли запись до Firestore (нет сети, правила базы не пускают поле readBy и т.п.). Поэтому время
// последнего прочтения дублируется в localStorage, а счётчик берёт большее из двух значений.
// В Firestore же отметка нужна только для того, чтобы у ОТПРАВИТЕЛЯ появилось «Прочитано».
export const CHAT_READ_EVENT = "vt-chat-read";
const LOCAL_PREFIX = "vt_chat_read:";

export function getLocalReadAt(uid: string, col: ChatCollection, id: string): number {
  if (typeof window === "undefined") return 0;
  try {
    return Number(localStorage.getItem(`${LOCAL_PREFIX}${uid}:${col}:${id}`)) || 0;
  } catch {
    return 0;
  }
}

function setLocalReadAt(uid: string, col: ChatCollection, id: string, ts: number) {
  if (typeof window === "undefined") return;
  try {
    const key = `${LOCAL_PREFIX}${uid}:${col}:${id}`;
    if ((Number(localStorage.getItem(key)) || 0) >= ts) return; // отметка только растёт
    localStorage.setItem(key, String(ts));
    window.dispatchEvent(new Event(CHAT_READ_EVENT)); // счётчики пересчитываются мгновенно
  } catch {
    // localStorage недоступен — останется только серверная отметка
  }
}

/** Подписка на локальные отметки (своя вкладка — событие, другие вкладки — storage). */
export function subscribeLocalReads(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key.startsWith(LOCAL_PREFIX)) cb();
  };
  window.addEventListener(CHAT_READ_EVENT, cb);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHAT_READ_EVENT, cb);
    window.removeEventListener("storage", onStorage);
  };
}

/** Что уже пытались записать в Firestore за эту сессию — чтобы не долбить базу одним и тем же при каждом рендере. */
const attempted = new Set<string>();

/**
 * Отмечает чат прочитанным ровно до сообщения lastMessageAt (время последнего чужого сообщения).
 * Именно время сообщения, а не «сейчас»: часы людей расходятся, и «сейчас» с часов читателя могло бы
 * накрыть новые сообщения собеседника, у которого часы отстают, — тогда они бы вообще не стали
 * «непрочитанными». Сравнивая время сообщения с временем сообщения, мы всегда в одной системе отсчёта.
 *
 *  1. Сразу пишем локально → бейдж пропадает мгновенно и всегда.
 *  2. Пытаемся записать в Firestore → у отправителя появится «Прочитано». Ошибку не роняем (отметка не
 *     критична), но логируем в консоль: permission-denied значит, что правила Firestore не разрешают
 *     участникам писать поле readBy в этой коллекции.
 */
export async function markChatRead(col: ChatCollection, id: string, readerKey: string, lastMessageAt: number) {
  setLocalReadAt(readerKey, col, id, lastMessageAt);

  const key = `${col}:${id}:${readerKey}:${lastMessageAt}`;
  if (attempted.has(key)) return;
  attempted.add(key);
  try {
    await updateDoc(doc(db, col, id), { [`readBy.${readerKey}`]: lastMessageAt });
  } catch (err: any) {
    console.warn(`markChatRead(${col}) не записалась в Firestore:`, err?.code ?? err?.message);
  }
}
