import { postWithToken } from "@/lib/authFetch";

/**
 * Клиентский аналог notifyTelegram() — шлёт push-уведомление пользователю, если у него
 * есть активная подписка на этом или другом устройстве. Fire-and-forget: если не подписан
 * или запрос не прошёл, ничего страшного — это не критично для основного действия.
 * keepalive: true — чтобы запрос долетел, даже если вкладка закроется сразу после вызова.
 */
export function notifyPush(uid: string, title: string, body: string, url?: string, category: "purchases" | "messages" | "reminders" | "news" = "messages"): void {
  postWithToken("/api/notify/push", { uid, title, body, url, category });
}
