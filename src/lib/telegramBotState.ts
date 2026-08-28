import { adminDb } from "./firebaseAdmin";

export type BotMode =
  | "awaiting_topup"
  | "awaiting_support"
  | "awaiting_partnership"
  | "awaiting_donate_amount"
  | "admin_awaiting_promo_create"
  | "admin_contest_winners"
  | "admin_contest_photo"
  | "admin_contest_text"
  | "admin_contest_button_text"
  | "admin_contest_channel"
  | "admin_contest_color"
  | "admin_contest_end_condition"
  | null;

export async function getBotState(chatId: number): Promise<BotMode> {
  const snap = await adminDb().collection("telegramBotState").doc(String(chatId)).get();
  if (!snap.exists) return null;
  return (snap.data()?.mode as BotMode) ?? null;
}

export async function setBotState(chatId: number, mode: BotMode) {
  await adminDb().collection("telegramBotState").doc(String(chatId)).set({ mode, updatedAt: Date.now() });
}

/** Черновик конкурса, который админ собирает по шагам мастера (см. lib/telegramContests.ts) —
 * живёт в том же документе состояния чата, что и BotMode, чтобы не заводить отдельную коллекцию
 * под один незавершённый диалог на чат. */
export interface ContestDraft {
  winnersCount?: number;
  photoUrl?: string;
  text?: string;
  buttonText?: string;
  buttonColor?: string;
  channelId?: string; // "@channel" или числовой chat_id — условие подписки
  endMode?: "time" | "participants";
  endValue?: number; // endMode === "time": минуты от старта; endMode === "participants": нужное число участников
}

export async function getContestDraft(chatId: number): Promise<ContestDraft> {
  const snap = await adminDb().collection("telegramBotState").doc(String(chatId)).get();
  return (snap.data()?.contestDraft as ContestDraft) ?? {};
}

export async function updateContestDraft(chatId: number, patch: Partial<ContestDraft>) {
  const current = await getContestDraft(chatId);
  await adminDb()
    .collection("telegramBotState")
    .doc(String(chatId))
    .set({ contestDraft: { ...current, ...patch }, updatedAt: Date.now() }, { merge: true });
}

export async function clearContestDraft(chatId: number) {
  await adminDb().collection("telegramBotState").doc(String(chatId)).set({ contestDraft: null, updatedAt: Date.now() }, { merge: true });
}
