import { auth } from "./firebase";

/**
 * Клиентский аналог notifyTelegram() — шлёт push-уведомление пользователю, если у него
 * есть активная подписка на этом или другом устройстве. Fire-and-forget: если не подписан
 * или запрос не прошёл, ничего страшного — это не критично для основного действия.
 * Сервер требует вход в аккаунт, поэтому к запросу добавляется токен текущего пользователя.
 * keepalive: true — чтобы запрос долетел, даже если вкладка закроется сразу после вызова.
 */
export function notifyPush(uid: string, title: string, body: string, url?: string, category: "purchases" | "messages" | "reminders" | "news" = "messages"): void {
  (async () => {
    const idToken = await auth.currentUser?.getIdToken();
    if (!idToken) return;
    await fetch("/api/notify/push", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ uid, title, body, url, category }),
      keepalive: true,
    });
  })().catch(() => {});
}
