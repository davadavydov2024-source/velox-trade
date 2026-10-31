import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";
import { isPlus } from "./premium";
import type { MessengerAccount, MessengerChat } from "./types";
import type { MessengerAuth } from "./server";

/**
 * Платные сообщения («Премиум Плюс»): владелец ставит цену в ⭐ за входящее сообщение.
 * Звёзды переходят с кошелька отправителя на кошелёк получателя (users.starsWallet), обе операции пишутся в starsWalletLog.
 * Бесплатно: если получатель сам уже писал отправителю в этом чате (chat.freeFor), и если цена не задана.
 */
export interface PaidCharge { price: number; peer: string }

export async function peerPrice(chat: MessengerChat, meUid: string): Promise<PaidCharge | null> {
  if (chat.type !== "dm") return null;
  const peer = chat.members.find((u) => u !== meUid);
  if (!peer || peer === meUid || chat.service || chat.freeFor?.includes(meUid)) return null;
  const acc = (await adminDb().collection("messengerAccounts").doc(peer).get()).data() as MessengerAccount | undefined;
  const price = Math.floor(acc?.messagePrice ?? 0);
  if (!acc || !isPlus(acc) || price <= 0) return null;
  return { price, peer };
}

/** Списывает цену у отправителя и зачисляет получателю. Возвращает списанную сумму или готовый ответ-ошибку. */
export async function chargePaidMessage(chat: MessengerChat, me: MessengerAuth): Promise<{ charged: PaidCharge | null } | { error: NextResponse }> {
  const c = await peerPrice(chat, me.uid);
  if (!c) return { charged: null };
  const db = adminDb();
  const from = db.collection("users").doc(me.uid), to = db.collection("users").doc(c.peer);
  const peerName = ((await db.collection("messengerAccounts").doc(c.peer).get()).data()?.displayName as string | undefined) ?? "";
  const now = Date.now();
  try {
    await db.runTransaction(async (tx) => {
      const have = ((await tx.get(from)).data()?.starsWallet as number | undefined) ?? 0;
      if (have < c.price) throw new Error("not-enough");
      tx.set(from, { starsWallet: FieldValue.increment(-c.price) }, { merge: true });
      tx.set(to, { starsWallet: FieldValue.increment(c.price) }, { merge: true });
      tx.set(db.collection("starsWalletLog").doc(), { uid: me.uid, delta: -c.price, type: "paid_message_out", ref: c.peer, name: peerName, at: now });
      tx.set(db.collection("starsWalletLog").doc(), { uid: c.peer, delta: c.price, type: "paid_message_in", ref: me.uid, name: me.account.displayName, at: now });
    });
  } catch (e) {
    if ((e as Error)?.message === "not-enough") {
      return { error: NextResponse.json({ error: `Этому человеку можно написать за ${c.price} ⭐ — пополни кошелёк`, needTopup: true, price: c.price }, { status: 402 }) };
    }
    throw e;
  }
  return { charged: c };
}

/** Возврат, если сообщение не удалось отправить после списания. */
export async function refundPaidMessage(meUid: string, c: PaidCharge): Promise<void> {
  const db = adminDb();
  const now = Date.now();
  await db.runTransaction(async (tx) => {
    tx.set(db.collection("users").doc(meUid), { starsWallet: FieldValue.increment(c.price) }, { merge: true });
    tx.set(db.collection("users").doc(c.peer), { starsWallet: FieldValue.increment(-c.price) }, { merge: true });
    tx.set(db.collection("starsWalletLog").doc(), { uid: meUid, delta: c.price, type: "paid_message_refund", ref: c.peer, at: now });
    tx.set(db.collection("starsWalletLog").doc(), { uid: c.peer, delta: -c.price, type: "paid_message_refund", ref: meUid, at: now });
  });
}

/** Владелец платных сообщений ответил — собеседнику можно писать бесплатно. */
export async function markFreeReply(chat: MessengerChat, me: MessengerAuth): Promise<void> {
  if (chat.type !== "dm" || !(me.account.messagePrice && me.account.messagePrice > 0)) return;
  const peer = chat.members.find((u) => u !== me.uid);
  if (!peer || chat.freeFor?.includes(peer)) return;
  await adminDb().collection("messengerChats").doc(chat.id).update({ freeFor: FieldValue.arrayUnion(peer) }).catch(() => {});
}
