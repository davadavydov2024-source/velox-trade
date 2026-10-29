import { auth } from "./firebase";

export type AdminEventKind = "registration" | "topup" | "product_edit" | "sell_request";

/**
 * Сообщает серверу о событии, о котором нужно уведомить админа в Telegram (с кнопками).
 * Fire-and-forget, как и остальные notify*: основное действие уже сохранено в Firestore.
 */
export function notifyAdminEvent(kind: AdminEventKind, id: string): void {
  auth.currentUser
    ?.getIdToken()
    .then((idToken) =>
      fetch("/api/notify/admin-event", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ kind, id }),
        keepalive: true,
      })
    )
    .catch(() => {});
}
