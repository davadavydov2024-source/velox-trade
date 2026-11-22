import { adminDb } from "@/lib/firebaseAdmin";
import { sendTelegramMessage } from "@/lib/telegramBot";
import { rememberForwardedMessage } from "@/lib/telegramAdminReplies";
import { dmChatId, postMessage, type MessengerAuth } from "./server";
import type { MessengerAccount, MessengerChat } from "./types";

/**
 * Поддержка MiliGram: официальный аккаунт @support в мессенджере и тот же канал в Telegram-боте.
 * Человек пишет в чат «Поддержка» (на сайте) или в бота — сообщение уходит админу в Telegram с пометкой.
 * Админ отвечает Reply на это сообщение — ответ приходит в чат поддержки в мессенджере и, если Telegram привязан, в бота.
 */
export const SUPPORT_UID = "miligram_support";
export const SUPPORT_HANDLE = "support";
const ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID ? Number(process.env.TELEGRAM_ADMIN_CHAT_ID) : null;
const ACK_EVERY_MS = 6 * 3_600_000;

const GREETING = "Здравствуйте! 👋 Это поддержка MiliGram.\n\nОпишите проблему или вопрос одним сообщением — мы ответим прямо здесь. Если к аккаунту привязан Telegram, ответ придёт и в бота.";

export async function ensureSupportAccount(): Promise<MessengerAuth> {
  const db = adminDb();
  const ref = db.collection("messengerAccounts").doc(SUPPORT_UID);
  let account = (await ref.get()).data() as MessengerAccount | undefined;
  if (!account) {
    const now = Date.now();
    account = {
      uid: SUPPORT_UID, handle: SUPPORT_HANDLE, displayName: "Поддержка MiliGram", photoURL: null, bio: "Официальная поддержка. Отвечаем здесь и в Telegram-боте",
      createdAt: now, lastSeenAt: now, showLastSeen: false, banned: false, verified: true,
      privacy: { whoCanMessage: "everyone", whoCanAddToGroups: "nobody" },
    };
    await ref.set(account);
    await db.collection("messengerHandles").doc(SUPPORT_HANDLE).set({ uid: SUPPORT_UID }, { merge: true });
  }
  return { uid: SUPPORT_UID, account };
}

/** Личный чат человека с поддержкой (создаётся при первом обращении). */
export async function ensureSupportChat(uid: string): Promise<{ chat: MessengerChat; created: boolean }> {
  const ref = adminDb().collection("messengerChats").doc(dmChatId(SUPPORT_UID, uid));
  let snap = await ref.get();
  const created = !snap.exists;
  if (created) {
    await ref.set({ type: "dm", members: [SUPPORT_UID, uid], admins: [], createdBy: SUPPORT_UID, updatedAt: Date.now(), readBy: {}, pinnedMessageIds: [] });
    snap = await ref.get();
  }
  return { chat: { id: ref.id, ...snap.data() } as MessengerChat, created };
}

export async function supportSay(uid: string, text: string): Promise<void> {
  const [bot, { chat }] = await Promise.all([ensureSupportAccount(), ensureSupportChat(uid)]);
  await postMessage({ chat, sender: bot, kind: "text", text: text.slice(0, 3900) });
}

/** Открыть чат поддержки: при первом обращении поддержка здоровается. */
export async function openSupport(uid: string): Promise<string> {
  await ensureSupportAccount();
  const { chat, created } = await ensureSupportChat(uid);
  if (created) await supportSay(uid, GREETING);
  return chat.id;
}

async function linkedTelegramChat(uid: string): Promise<number> {
  const d = (await adminDb().collection("telegramLinks").doc(uid).get()).data();
  return typeof d?.chatId === "number" ? d.chatId : 0;
}

/** Сообщение человека в чате поддержки на сайте: админу в Telegram + разовое «приняли». */
export async function onSupportMessage(user: MessengerAuth, text: string): Promise<void> {
  if (ADMIN_CHAT_ID) {
    const tag = `@${user.account.handle} · MiliGram`;
    const body = `🆘 Поддержка (MiliGram) от ${user.account.displayName} (${tag}):\n\n${text}\n\n↩️ Чтобы ответить — сделай Reply прямо на это сообщение.`;
    const id = await sendTelegramMessage(ADMIN_CHAT_ID, body.slice(0, 4000));
    if (id) await rememberForwardedMessage(id, { chatId: 0, firstName: user.account.displayName, userTag: tag, kind: "support", createdAt: Date.now(), messengerUid: user.uid });
  }
  const ref = adminDb().collection("messengerSupport").doc(user.uid);
  const last = ((await ref.get()).data()?.lastAckAt as number | undefined) ?? 0;
  if (Date.now() - last > ACK_EVERY_MS) {
    await ref.set({ lastAckAt: Date.now() }, { merge: true });
    await supportSay(user.uid, "Приняли ✅ Ответим здесь, как только сможем.");
  }
}

/** Сообщение из Telegram-бота, где Telegram привязан к аккаунту MiliGram: зеркалим в чат поддержки, чтобы история была в одном месте. */
export async function mirrorTelegramSupport(uid: string, text: string): Promise<void> {
  const acc = (await adminDb().collection("messengerAccounts").doc(uid).get()).data() as MessengerAccount | undefined;
  if (!acc) return;
  await ensureSupportAccount();
  const { chat, created } = await ensureSupportChat(uid);
  if (created) await supportSay(uid, GREETING);
  await postMessage({ chat, sender: { uid, account: acc }, kind: "text", text: text.slice(0, 3900) });
}

/** Ответ админа (Reply в Telegram): в чат поддержки в мессенджере и в бота, если там есть этот человек. */
export async function deliverSupportReply(m: { chatId: number; messengerUid?: string }, text: string): Promise<void> {
  const tgText = `💬 Ответ от поддержки MiliGram:\n\n${text}`;
  if (m.messengerUid) {
    await supportSay(m.messengerUid, text);
    const tg = m.chatId || (await linkedTelegramChat(m.messengerUid));
    if (tg) await sendTelegramMessage(tg, tgText);
  } else if (m.chatId) {
    await sendTelegramMessage(m.chatId, tgText);
  }
}
