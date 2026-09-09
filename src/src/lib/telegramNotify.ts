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

/** Шлёт уведомление прямо админу (не привязано к конкретному пользователю) — для новых
 * пользователей, новых заявок и т.п., которые админ должен увидеть проактивно. */
export function notifyAdminTelegram(text: string): void {
  fetch("/api/notify/admin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
    keepalive: true,
  }).catch(() => {});
}
