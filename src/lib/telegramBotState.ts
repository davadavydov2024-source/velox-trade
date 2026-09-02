import { adminDb } from "./firebaseAdmin";
import { stripUndefined } from "./stripUndefined";

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
}

export async function getContestDraft(chatId: number): Promise<ContestDraft> {
  const snap = await adminDb().collection("telegramBotState").doc(String(chatId)).get();
  return (snap.data()?.contestDraft as ContestDraft) ?? {};
}

export async function updateContestDraft(chatId: number, patch: Partial<ContestDraft>) {
  const current = await getContestDraft(chatId);
  // Firestore не принимает undefined как значение поля (та же проблема, что чинили в lib/users.ts
  // и других местах — см. stripUndefined) — patch может прийти с photoUrl: undefined на шаге
  // "пропустить фото", и без этой очистки set() падал бы прямо посреди мастера создания конкурса.
  const merged = stripUndefined({ ...current, ...patch });
  await adminDb().collection("telegramBotState").doc(String(chatId)).set({ contestDraft: merged, updatedAt: Date.now() }, { merge: true });
}

export async function clearContestDraft(chatId: number) {
  await adminDb().collection("telegramBotState").doc(String(chatId)).set({ contestDraft: null, updatedAt: Date.now() }, { merge: true });
}
