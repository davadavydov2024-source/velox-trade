import { adminDb } from "./firebaseAdmin";

export type BotMode =
  | "awaiting_topup"
  | "awaiting_support"
  | "awaiting_partnership"
  | "awaiting_donate_amount"
  | "admin_awaiting_promo_create"
  | null;

export async function getBotState(chatId: number): Promise<BotMode> {
  const snap = await adminDb().collection("telegramBotState").doc(String(chatId)).get();
  if (!snap.exists) return null;
  return (snap.data()?.mode as BotMode) ?? null;
}

export async function setBotState(chatId: number, mode: BotMode) {
  await adminDb().collection("telegramBotState").doc(String(chatId)).set({ mode, updatedAt: Date.now() });
}
