/**
 * Шлёт пользователю уведомление в Telegram (если у него привязан аккаунт) — "не дождались",
 * fire-and-forget: если у человека Telegram не привязан или запрос не прошёл, ничего страшного
 * не происходит, основное действие (заказ, бан и т.д.) уже сохранено в Firestore до вызова этой функции.
 * keepalive: true — чтобы запрос долетел, даже если вкладка того, кто вызвал действие (купил,
 * написал в чат и т.п.), закроется или уйдёт со страницы сразу после клика.
 */
export function notifyTelegram(uid: string, text: string): void {
  fetch("/api/notify/telegram", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uid, text }),
    keepalive: true,
  }).catch(() => {
    // Намеренно игнорируем: уведомление не критично для основного действия.
  });
}

/**
 * Уведомление о сообщении из чата: head — заголовок, rawText — текст сообщения вместе с разметкой.
 * Форматирование сохраняется, а скрытый текст приходит в боте как спойлер (скрыт до нажатия).
 */
export function notifyTelegramChat(uid: string, head: string, rawText: string): void {
  fetch("/api/notify/telegram", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uid, text: head, chat: rawText }),
    keepalive: true,
  }).catch(() => {});
}

/** Шлёт уведомление прямо админу (не привязано к конкретному пользователю) — для новых
 * пользователей, новых заявок и т.п., которые админ должен увидеть проактивно. */
export function notifyAdminTelegram(text: string, path?: string): void {
  fetch("/api/notify/admin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, path }),
    keepalive: true,
  }).catch(() => {});
}

/**
 * Email-версия notifyTelegram выше — тот же fire-and-forget паттерн. Используется только для
 * реальных событий по сделкам (сообщение в чате заказа, ответ поддержки, одобрение товара) —
 * НЕ для личных сообщений и обменов, см. комментарий в api/notify/email/route.ts.
 */
export function notifyEmail(uid: string, subject: string, html: string): void {
  fetch("/api/notify/email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uid, subject, html }),
    keepalive: true,
  }).catch(() => {
    // Намеренно игнорируем: уведомление не критично для основного действия.
  });
}
