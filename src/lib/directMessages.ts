import { doc, getDoc, setDoc, updateDoc, onSnapshot, arrayUnion, collection, query, where, orderBy } from "firebase/firestore";
import { db } from "./firebase";
import { DirectConversation, DirectMessage } from "@/types";

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
  const q = query(collection(db, "directConversations"), where("participants", "array-contains", uid), orderBy("updatedAt", "desc"));
  return onSnapshot(q, (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as DirectConversation)));
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
}
