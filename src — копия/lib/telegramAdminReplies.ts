import { adminDb } from "./firebaseAdmin";

export type ForwardKind = "topup" | "support" | "partnership";

export interface ForwardMapping {
  chatId: number;
  firstName: string;
  userTag: string;
  kind: ForwardKind;
  createdAt: number;
}

/**
 * Запоминает, какому пользователю принадлежит сообщение, пересланное админу.
 * Если админ потом ответит (Reply) на это самое сообщение в Telegram — найдём его здесь
 * по adminMessageId и доставим ответ обратно этому пользователю.
 */
export async function rememberForwardedMessage(adminMessageId: number, mapping: ForwardMapping) {
  await adminDb().collection("telegramAdminReplies").doc(String(adminMessageId)).set(mapping);
}

export async function findForwardedMessage(adminMessageId: number): Promise<ForwardMapping | null> {
  const snap = await adminDb().collection("telegramAdminReplies").doc(String(adminMessageId)).get();
  if (!snap.exists) return null;
  return snap.data() as ForwardMapping;
}
