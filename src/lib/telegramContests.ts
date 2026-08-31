import { adminDb } from "./firebaseAdmin";
import { sendTelegramMessage, sendTelegramPhoto, editTelegramMessage, checkChannelMembership, InlineButton } from "./telegramBot";
import { setBotState, getContestDraft, updateContestDraft, clearContestDraft } from "./telegramBotState";
import { stripUndefined } from "./stripUndefined";
import { findUidByChatId } from "./telegramUserInfo";
import { TelegramContest, TelegramContestEntry } from "@/types";

const COLOR_CHOICES: { label: string; value: string }[] = [
  { label: "🔵 Синий", value: "blue" },
  { label: "🟢 Зелёный", value: "green" },
  { label: "🔴 Красный", value: "red" },
  { label: "🟡 Жёлтый", value: "yellow" },
  { label: "⚪️ Обычный", value: "default" },
];

// ===================== Меню и старт мастера =====================

export function contestMenuButtons(): InlineButton[][] {
  return [
    [{ text: "➕ Новый конкурс", callback_data: "contest_new" }],
    [{ text: "📋 Активные конкурсы", callback_data: "contest_active_list" }],
    [{ text: "⬅️ Назад", callback_data: "admin_menu" }],
  ];
}

export const CONTEST_MENU_TEXT = "🎉 Конкурсы. Что делаем?";

export async function startContestWizard(chatId: number) {
  await clearContestDraft(chatId);
  await setBotState(chatId, "admin_contest_winners");
  await sendTelegramMessage(chatId, "Сколько будет победителей? Введи число (например, 1 или 3).");
}

// ===================== Шаги мастера (обработка текстовых ответов) =====================
// Каждая функция возвращает true, если сама разобралась с сообщением (и отправила следующий
// шаг/ошибку), false — если сообщение не подошло под ожидаемый формат этого шага.

export async function handleContestWinnersStep(chatId: number, text: string): Promise<boolean> {
  const n = Number(text.trim());
  if (!Number.isInteger(n) || n < 1 || n > 50) {
    await sendTelegramMessage(chatId, "Введи целое число победителей от 1 до 50.");
    return true;
  }
  await updateContestDraft(chatId, { winnersCount: n });
  await setBotState(chatId, "admin_contest_photo");
  await sendTelegramMessage(chatId, "Пришли фото для поста конкурса (или напиши «пропустить», если без фото).");
  return true;
}

export async function handleContestPhotoStep(chatId: number, photoUrl: string | null, skip: boolean): Promise<boolean> {
  if (!skip && !photoUrl) return false; // не фото и не "пропустить" — пусть основной обработчик решит, что делать
  await updateContestDraft(chatId, { photoUrl: photoUrl ?? undefined });
  await setBotState(chatId, "admin_contest_text");
  await sendTelegramMessage(chatId, "Текст поста конкурса — что разыгрываем, условия и т.п.");
  return true;
}

export async function handleContestTextStep(chatId: number, text: string): Promise<boolean> {
  const trimmed = text.trim();
  if (!trimmed) {
    await sendTelegramMessage(chatId, "Текст не может быть пустым — напиши что-нибудь.");
    return true;
  }
  await updateContestDraft(chatId, { text: trimmed });
  await setBotState(chatId, "admin_contest_button_text");
  await sendTelegramMessage(chatId, "Текст на кнопке участия (например: «Участвовать 🎉»).");
  return true;
}

export async function handleContestButtonTextStep(chatId: number, text: string): Promise<boolean> {
  const trimmed = text.trim();
  if (!trimmed) {
    await sendTelegramMessage(chatId, "Текст кнопки не может быть пустым.");
    return true;
  }
  await updateContestDraft(chatId, { buttonText: trimmed });
  await setBotState(chatId, "admin_contest_color");
  await sendTelegramMessage(
    chatId,
    "Выбери цвет кнопки (влияет на подпись в сообщении — Telegram не красит сами inline-кнопки):",
    COLOR_CHOICES.map((c) => [{ text: c.label, callback_data: `contest_color_${c.value}` }])
  );
  return true;
}

export async function handleContestColorChoice(chatId: number, messageId: number, color: string) {
  await updateContestDraft(chatId, { buttonColor: color });
  await setBotState(chatId, "admin_contest_channel");
  await editTelegramMessage(chatId, messageId, "Цвет выбран. Теперь укажи канал для конкурса — username вида @channel или числовой ID.");
}

export async function handleContestChannelStep(chatId: number, text: string): Promise<boolean> {
  const trimmed = text.trim();
  if (!trimmed) {
    await sendTelegramMessage(chatId, "Укажи канал — например @my_channel.");
    return true;
  }
  const channelId = trimmed.startsWith("@") || trimmed.startsWith("-") ? trimmed : `@${trimmed}`;
  await updateContestDraft(chatId, { channelId });
  await setBotState(chatId, "admin_contest_end_condition");
  await sendTelegramMessage(chatId, "Как определить итоги конкурса?", [
    [{ text: "⏱ По времени", callback_data: "contest_end_time" }],
    [{ text: "👥 По количеству участников", callback_data: "contest_end_participants" }],
  ]);
  return true;
}

export async function handleContestEndModeChoice(chatId: number, messageId: number, mode: "time" | "participants") {
  await updateContestDraft(chatId, { endMode: mode });
  await setBotState(chatId, "admin_contest_end_condition");
  const prompt =
    mode === "time"
      ? "Через сколько минут подвести итоги? Введи число (например, 1440 — это сутки)."
      : "При каком количестве участников подвести итоги? Введи число.";
  await editTelegramMessage(chatId, messageId, prompt);
}

/** Финальный шаг мастера — принимает endValue и сразу публикует конкурс, раз это последний шаг. */
export async function handleContestEndValueStep(chatId: number, text: string): Promise<boolean> {
  const n = Number(text.trim());
  if (!Number.isInteger(n) || n < 1) {
    await sendTelegramMessage(chatId, "Введи целое положительное число.");
    return true;
  }
  await updateContestDraft(chatId, { endValue: n });
  await publishContest(chatId);
  return true;
}

// ===================== Публикация =====================

async function publishContest(adminChatId: number) {
  const draft = await getContestDraft(adminChatId);
  if (!draft.winnersCount || !draft.text || !draft.buttonText || !draft.channelId || !draft.endMode || !draft.endValue) {
    await sendTelegramMessage(adminChatId, "Что-то в мастере пошло не так — начни заново командой «Конкурсы».");
    await clearContestDraft(adminChatId);
    await setBotState(adminChatId, null);
    return;
  }

  const db = adminDb();
  const contestRef = db.collection("telegramContests").doc();
  const now = Date.now();
  const endsAt = draft.endMode === "time" ? now + draft.endValue * 60 * 1000 : undefined;

  const contest: Omit<TelegramContest, "id"> = {
    createdByAdminChatId: adminChatId,
    winnersCount: draft.winnersCount,
    photoUrl: draft.photoUrl,
    text: draft.text,
    buttonText: draft.buttonText,
    buttonColor: draft.buttonColor ?? "default",
    channelId: draft.channelId,
    endMode: draft.endMode,
    endValue: draft.endValue,
    status: "active",
    createdAt: now,
    ...(endsAt ? { endsAt } : {}),
  };

  await contestRef.set(stripUndefined(contest));

  const postText = `🎉 ${draft.text}\n\n🏆 Победителей: ${draft.winnersCount}\n📢 Условие: подписка на канал`;
  const buttons: InlineButton[][] = [[{ text: draft.buttonText, callback_data: `contest_join_${contestRef.id}` }]];

  const messageId = draft.photoUrl
    ? await sendPhotoToChannelAndGetId(draft.channelId, draft.photoUrl, postText, buttons)
    : await sendMessageToChannelAndGetId(draft.channelId, postText, buttons);

  if (!messageId) {
    await sendTelegramMessage(adminChatId, `⚠️ Не удалось опубликовать пост в канале ${draft.channelId}. Проверь, что бот добавлен туда администратором.`);
  } else {
    await contestRef.update({ messageId });
    await sendTelegramMessage(adminChatId, `✅ Конкурс опубликован в ${draft.channelId}!`);
  }

  await clearContestDraft(adminChatId);
  await setBotState(adminChatId, null);
}

// sendTelegramPhoto/sendTelegramMessage в lib/telegramBot.ts принимают chat_id только как number
// (личные чаты) — Bot API на самом деле принимает и строковый @username канала, поэтому
// используем небольшой type-cast здесь, а не меняем сигнатуры общих функций ради одного места.
async function sendMessageToChannelAndGetId(channelId: string, text: string, buttons: InlineButton[][]): Promise<number | null> {
  return sendTelegramMessage(channelId as unknown as number, text, buttons);
}
async function sendPhotoToChannelAndGetId(channelId: string, photoUrl: string, caption: string, buttons: InlineButton[][]): Promise<number | null> {
  const ok = await sendTelegramPhoto(channelId as unknown as number, photoUrl, caption, buttons);
  // sendTelegramPhoto возвращает только boolean, а не message_id — конкурсу с фото придётся
  // обойтись без последующего редактирования поста при завершении (пишем итоги отдельным
  // сообщением в канал вместо editMessageText, см. finishContest ниже). -1 как метка "успех без id".
  return ok ? -1 : null;
}

// ===================== Участие =====================

/** Нажатие кнопки "Участвовать" под постом в канале. Возвращает текст для всплывающего
 * уведомления Telegram (передаётся в answerCallbackQuery на уровне webhook).
 * Итоги теперь подводятся только вручную админом через сайт (/admin/contests) — здесь никакого
 * автозавершения нет, ни по времени, ни по числу участников, чтобы не завершить конкурс раньше,
 * чем админ реально готов это сделать. */
export async function handleContestJoin(contestId: string, chatId: number, firstName: string, telegramUsername: string | null): Promise<string> {
  const db = adminDb();
  const contestSnap = await db.collection("telegramContests").doc(contestId).get();
  if (!contestSnap.exists) return "Конкурс не найден.";
  const contest = contestSnap.data() as TelegramContest;
  if (contest.status !== "active") return "Конкурс уже завершён.";

  // Участие требует привязанный к сайту аккаунт — иначе не по кому будет узнать победителя на
  // сайте и что-либо выдать/начислить ему. Ссылка та же, что бот уже использует для команд
  // /balance и /orders (см. lib/telegramUserInfo.ts → findUidByChatId).
  const uid = await findUidByChatId(chatId);
  if (!uid) {
    return "Сначала подключи Telegram к своему аккаунту на сайте: Профиль → Безопасность → «Подключить Telegram», потом жми участвовать снова.";
  }

  const isMember = await checkChannelMembership(contest.channelId, chatId);
  if (!isMember) return `Сначала подпишись на ${contest.channelId}, потом жми участвовать снова.`;

  const entryRef = db.collection("telegramContestEntries").doc(`${contestId}_${chatId}`);
  const existing = await entryRef.get();
  if (existing.exists) return "Ты уже участвуешь в этом конкурсе! 🎉";

  const entry: Omit<TelegramContestEntry, "id"> = { contestId, chatId, uid, telegramUsername, firstName, joinedAt: Date.now() };
  await entryRef.set(entry);

  return "Ты участвуешь! Итоги подведёт администратор. Удачи! 🍀";
}

// ===================== Подведение итогов =====================

/** Вызывается из cron (см. api/cron/reminders — туда добавлена проверка истёкших по времени
 * конкурсов) и напрямую из handleContestJoin для конкурсов "по количеству участников". */
export async function finishContest(contestId: string) {
  const db = adminDb();
  const contestRef = db.collection("telegramContests").doc(contestId);
  const contestSnap = await contestRef.get();
  if (!contestSnap.exists) return;
  const contest = contestSnap.data() as TelegramContest;
  if (contest.status !== "active") return; // уже завершён — не разыгрываем дважды

  const entriesSnap = await db.collection("telegramContestEntries").where("contestId", "==", contestId).get();
  const entries = entriesSnap.docs.map((d) => d.data() as TelegramContestEntry);

  const shuffled = [...entries].sort(() => Math.random() - 0.5);
  const winners = shuffled.slice(0, contest.winnersCount);

  await contestRef.update({
    status: "finished",
    finishedAt: Date.now(),
    winnerChatIds: winners.map((w) => w.chatId),
  });

  const winnersText =
    winners.length === 0
      ? "Участников не набралось 😔"
      : winners.map((w, i) => `${i + 1}. ${w.firstName}${w.telegramUsername ? ` (@${w.telegramUsername})` : ""}`).join("\n");

  const resultText = `🏁 Конкурс завершён!\n\nВсего участников: ${entries.length}\n\n🏆 Победители:\n${winnersText}`;

  // Пост с фото не имеет сохранённого message_id (см. комментарий в sendPhotoToChannelAndGetId
  // выше) — для него итоги идут отдельным сообщением в канал. Пост без фото редактируем на
  // месте, чтобы кнопка "Участвовать" пропала и результат был виден прямо в исходном посте.
  if (contest.messageId && contest.messageId > 0) {
    await editTelegramMessage(contest.channelId as unknown as number, contest.messageId, `${contest.text}\n\n${resultText}`);
  } else {
    await sendTelegramMessage(contest.channelId as unknown as number, resultText);
  }

  await sendTelegramMessage(contest.createdByAdminChatId, `🏁 Конкурс завершён и итоги опубликованы в ${contest.channelId}.\n\n${resultText}`);

  for (const winner of winners) {
    await sendTelegramMessage(winner.chatId, `🎉 Поздравляем! Ты выиграл(а) в конкурсе «${contest.text.slice(0, 60)}»! Организатор скоро свяжется с тобой.`);
  }
}

export async function sendActiveContestsList(chatId: number) {
  const snap = await adminDb().collection("telegramContests").where("status", "==", "active").get();
  if (snap.empty) {
    await sendTelegramMessage(chatId, "Активных конкурсов нет.");
    return;
  }
  for (const doc of snap.docs) {
    const c = doc.data() as TelegramContest;
    const entriesSnap = await adminDb().collection("telegramContestEntries").where("contestId", "==", doc.id).count().get();
    await sendTelegramMessage(
      chatId,
      `🎉 ${c.text.slice(0, 80)}\nКанал: ${c.channelId}\nУчастников: ${entriesSnap.data().count}\n\nПодвести итоги можно на сайте: /admin/contests`
    );
  }
}
