import { doc, getDoc, setDoc, updateDoc, onSnapshot, arrayUnion, collection, query, where } from "firebase/firestore";
import { db } from "./firebase";
import { DirectConversation, DirectMessage } from "@/types";
import { notifyTelegram } from "./telegramNotify";
import { notifyPush } from "./webPushNotify";

export function conversationId(uidA: string, uidB: string): string {
  return [uidA, uidB].sort().join("_");
}

function convRef(id: string) {
  return doc(db, "directConversations", id);
}

export function subscribeConversation(id: string, cb: (conv: DirectConversation | null) => void) {
  return onSnapshot(convRef(id), (snap) => cb(snap.exists() ? ({ id: snap.id, ...snap.data() } as DirectConversation) : null));
}

/** Список диалогов пользователя, живой (обновляется сам при новом сообщении) — для /messages. */
export function subscribeUserConversations(uid: string, cb: (list: DirectConversation[]) => void) {
  // Без orderBy в запросе: array-contains + orderBy по другому полю требует составной индекс Firestore
  // (без него слушатель падал с failed-precondition и список личных сообщений не загружался).
  // Сортируем на клиенте — у человека диалогов немного, разницы нет.
  const q = query(collection(db, "directConversations"), where("participants", "array-contains", uid));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as DirectConversation);
      list.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
      cb(list);
    },
    (err) => {
      console.error("subscribeUserConversations:", err);
      cb([]);
    }
  );
}

export async function sendDirectMessage(
  fromUid: string,
  fromName: string,
  fromPhoto: string | null,
  toUid: string,
  toName: string,
  toPhoto: string | null,
  text: string,
  imageUrl?: string
) {
  const id = conversationId(fromUid, toUid);
  const ref = convRef(id);
  const snap = await getDoc(ref);
  const message: DirectMessage = { from: fromUid, text, createdAt: Date.now(), ...(imageUrl ? { imageUrl } : {}) };
  const preview = imageUrl ? (text.trim() ? `📷 ${text}` : "📷 Фото") : text;

  if (!snap.exists()) {
    await setDoc(ref, {
      participants: [fromUid, toUid],
      participantNames: { [fromUid]: fromName, [toUid]: toName },
      participantPhotos: { [fromUid]: fromPhoto, [toUid]: toPhoto },
      messages: [message],
      updatedAt: Date.now(),
      lastMessage: preview,
    });
  } else {
    await updateDoc(ref, {
      messages: arrayUnion(message),
      updatedAt: Date.now(),
      lastMessage: preview,
      [`participantNames.${fromUid}`]: fromName,
      [`participantPhotos.${fromUid}`]: fromPhoto,
    });
  }

  // Уведомляем получателя в Telegram и push-уведомлением в браузере — раньше сообщение просто
  // тихо ложилось в Firestore, и человек узнавал о нём только если сам зашёл на сайт в «Чаты»
  // (особенно заметно было, когда писал админ). Email сюда намеренно НЕ подключаем — см.
  // комментарий в api/notify/email/route.ts: личные сообщения решили туда не слать, это шум.
  notifyTelegram(toUid, `💬 ${fromName} написал(а) вам:\n${preview}`);
  notifyPush(toUid, `Сообщение от ${fromName}`, preview, "/chats", "messages");
}
