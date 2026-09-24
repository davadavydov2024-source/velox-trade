import { auth } from "./firebase";

export type StarsInvoiceResult =
  | { ok: true; amountStars: number }
  | { ok: false; error: "not-linked" | "other"; message: string };

/** Создаёт счёт на оплату товара Telegram Stars и отправляет его покупателю в бота.
 * Требует, чтобы покупатель уже привязал Telegram к аккаунту (см. profile/security). */
export async function requestStarsInvoice(productId: string, quantity = 1): Promise<StarsInvoiceResult> {
  const user = auth.currentUser;
  if (!user) return { ok: false, error: "other", message: "Нужно войти в аккаунт" };

  const idToken = await user.getIdToken();
  const res = await fetch("/api/telegram/stars/invoice", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ productId, quantity }),
  });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    if (data?.error === "not-linked") {
      return { ok: false, error: "not-linked", message: "Сначала привяжи Telegram в профиле — «Безопасность» → «Подключить Telegram»" };
    }
    return { ok: false, error: "other", message: data?.error ?? "Не удалось создать счёт" };
  }

  return { ok: true, amountStars: data.amountStars };
}
