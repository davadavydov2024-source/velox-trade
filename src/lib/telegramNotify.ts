import { auth } from "./firebase";

/**
 * Клиентские уведомления (fire-and-forget): основное действие (заказ, чат, бан и т.д.) уже сохранено в
 * Firestore до вызова. Серверные роуты /api/notify/* требуют вход в аккаунт, поэтому к каждому запросу
 * добавляется Firebase ID token текущего пользователя. Без входа молча ничего не делает.
 * keepalive: true — чтобы запрос долетел, даже если вкладка закроется сразу после клика.
 */
function post(url: string, body: unknown): void {
  (async () => {
    const idToken = await auth.currentUser?.getIdToken();
    if (!idToken) return;
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
      body: JSON.stringify(body),
      keepalive: true,
    });
  })().catch(() => {
    // Намеренно игнорируем: уведомление не критично для основного действия.
  });
}

/** Шлёт пользователю уведомление в Telegram (если у него привязан аккаунт). */
export function notifyTelegram(uid: string, text: string): void {
  post("/api/notify/telegram", { uid, text });
}

/**
 * Уведомление о сообщении из чата: head — заголовок, rawText — текст сообщения вместе с разметкой.
 * Форматирование сохраняется, а скрытый текст приходит в боте как спойлер (скрыт до нажатия).
 */
export function notifyTelegramChat(uid: string, head: string, rawText: string): void {
  post("/api/notify/telegram", { uid, text: head, chat: rawText });
}

/** Шлёт уведомление прямо админу — для новых заявок и т.п. */
export function notifyAdminTelegram(text: string, path?: string): void {
  post("/api/notify/admin", { text, path });
}

/** Email-версия notifyTelegram — только для реальных событий по сделкам (см. api/notify/email). */
export function notifyEmail(uid: string, subject: string, html: string): void {
  post("/api/notify/email", { uid, subject, html });
}
