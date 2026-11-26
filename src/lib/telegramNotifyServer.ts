import { adminDb } from "./firebaseAdmin";
import { sendTelegramMessage } from "./telegramBot";
import { getNotifyPrefs } from "./userPrefs";

/**
 * То же самое, что notifyTelegram() из telegramNotify.ts, но для вызова прямо из серверного
 * кода (API-роуты) — без похода по HTTP на самого себя. Из-за этого событие (покупка,
 * розыгрыш колеса и т.п.) долетает до Telegram-бота гарантированно, даже если тот, кто
 * вызвал действие, тут же закрыл вкладку — обработка идёт целиком на сервере.
 */
export async function notifyTelegramServer(uid: string, text: string): Promise<void> {
  try {
    if (!uid) return;
    if (!(await getNotifyPrefs(uid)).telegram) return; // получатель отключил Telegram-уведомления
    const linkSnap = await adminDb().collection("telegramLinks").doc(uid).get();
    if (!linkSnap.exists) return;
    const { chatId } = linkSnap.data() as { chatId: number };
    await sendTelegramMessage(chatId, text);
  } catch (err) {
    console.error("notifyTelegramServer error:", err);
  }
}

/** То же самое для уведомлений прямо админу (TELEGRAM_ADMIN_CHAT_ID) — из серверного кода, без
 * похода на свой же /api/notify/admin. См. комментарий у notifyTelegramServer выше. */
export async function notifyAdminTelegramServer(text: string): Promise<void> {
  try {
    const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID ? Number(process.env.TELEGRAM_ADMIN_CHAT_ID) : null;
    if (!adminChatId) return;
    await sendTelegramMessage(adminChatId, text);
  } catch (err) {
    console.error("notifyAdminTelegramServer error:", err);
  }
}


/** Сообщение в Telegram-бота пользователя с HTML-разметкой и кнопками (например, «Копировать код»). */
export async function notifyTelegramServerButtons(uid: string, html: string, buttons: Parameters<typeof sendTelegramMessage>[2]): Promise<void> {
  try {
    const linkSnap = await adminDb().collection("telegramLinks").doc(uid).get();
    if (!linkSnap.exists) return;
    const { chatId } = linkSnap.data() as { chatId: number };
    await sendTelegramMessage(chatId, html, buttons, "HTML");
  } catch (err) {
    console.error("notifyTelegramServerButtons error:", err);
  }
}
