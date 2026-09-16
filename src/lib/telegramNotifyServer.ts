import { adminDb } from "./firebaseAdmin";
import { sendTelegramMessage } from "./telegramBot";

/**
 * То же самое, что notifyTelegram() из telegramNotify.ts, но для вызова прямо из серверного
 * кода (API-роуты) — без похода по HTTP на самого себя. Из-за этого событие (покупка,
 * розыгрыш колеса и т.п.) долетает до Telegram-бота гарантированно, даже если тот, кто
 * вызвал действие, тут же закрыл вкладку — обработка идёт целиком на сервере.
 */
export async function notifyTelegramServer(uid: string, text: string): Promise<void> {
  try {
    if (!uid) return;
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
