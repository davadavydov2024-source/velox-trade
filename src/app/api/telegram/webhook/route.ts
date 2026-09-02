import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import {
  sendTelegramMessage,
  editTelegramMessage,
  answerCallbackQuery,
  answerPreCheckoutQuery,
  sendInvoice,
  generateSixDigitCode,
} from "@/lib/telegramBot";
import { getBotState, setBotState } from "@/lib/telegramBotState";
import {
  mainMenuText,
  mainMenuButtons,
  FEEDBACK_MENU_TEXT,
  feedbackMenuButtons,
  TOPUP_INSTRUCTIONS,
  SUPPORT_INSTRUCTIONS,
  PARTNERSHIP_INSTRUCTIONS,
  backOnlyButtons,
  DONATE_MIN,
  DONATE_MAX,
  DONATE_PROMPT_TEXT,
} from "@/lib/telegramMenus";
import {
  adminMenuButtons,
  ADMIN_MENU_TEXT,
  sendPendingSellRequests,
  approveSellRequestFromBot,
  rejectSellRequestFromBot,
  sendPendingTopUps,
  approveTopUpFromBot,
  rejectTopUpFromBot,
  promoMenuButtons,
  PROMO_CREATE_INSTRUCTIONS,
  createPromoCodeFromText,
  sendActivePromoCodes,
  deactivatePromoCodeFromBot,
} from "@/lib/telegramAdminPanel";
import { rememberForwardedMessage, findForwardedMessage, ForwardKind } from "@/lib/telegramAdminReplies";
import { findUidByChatId, getBalanceMessage, getRecentOrdersMessage } from "@/lib/telegramUserInfo";
import {
  contestMenuButtons,
  CONTEST_MENU_TEXT,
  startContestWizard,
  handleContestWinnersStep,
  handleContestPhotoStep,
  handleContestTextStep,
  handleContestButtonTextStep,
  handleContestColorChoice,
  handleContestChannelStep,
  handleContestJoin,
  sendActiveContestsList,
} from "@/lib/telegramContests";

export const runtime = "nodejs";

const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;
const ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID ? Number(process.env.TELEGRAM_ADMIN_CHAT_ID) : null;
const SITE_NAME = "Velox Trade";

const PARTNERSHIP_TRIGGER = "хочу сотрудничать с velox trade";

const KIND_ICON: Record<ForwardKind, string> = { topup: "💰", support: "🆘", partnership: "🤝" };
const KIND_LABEL: Record<ForwardKind, string> = {
  topup: "Пополнение/вывод",
  support: "Поддержка",
  partnership: "Запрос на сотрудничество",
};

function isAdminChat(chatId: number): boolean {
  return ADMIN_CHAT_ID !== null && chatId === ADMIN_CHAT_ID;
}

async function forwardToAdmin(kind: ForwardKind, chatId: number, firstName: string, userTag: string, text: string) {
  if (!ADMIN_CHAT_ID) return;
  const body = `${KIND_ICON[kind]} ${KIND_LABEL[kind]} от ${firstName} (${userTag}):\n\n${text}\n\n↩️ Чтобы ответить человеку — сделай Reply прямо на это сообщение.`;
  const messageId = await sendTelegramMessage(ADMIN_CHAT_ID, body);
  if (messageId) {
    await rememberForwardedMessage(messageId, { chatId, firstName, userTag, kind, createdAt: Date.now() });
  }
}

async function handleAccountLinking(code: string, chatId: number, telegramUsername: string | null): Promise<boolean> {
  const db = adminDb();

  const linkReqRef = db.collection("telegramLinkRequests").doc(code);
  const linkReqSnap = await linkReqRef.get();
  if (linkReqSnap.exists) {
    const { uid } = linkReqSnap.data() as { uid: string };
    await db.collection("telegramLinks").doc(uid).set({ chatId, telegramUsername, linkedAt: Date.now() });
    await linkReqRef.delete();
    await sendTelegramMessage(chatId, `Telegram успешно привязан к твоему аккаунту ${SITE_NAME}! Теперь при входе с нового устройства код будет приходить сюда.`);
    return true;
  }

  const regReqRef = db.collection("telegramRegisterRequests").doc(code);
  const regReqSnap = await regReqRef.get();
  if (regReqSnap.exists) {
    const { email, displayName, status } = regReqSnap.data() as { email: string; displayName: string; status: string };

    if (status === "done") {
      await sendTelegramMessage(chatId, "Этот аккаунт уже зарегистрирован. Просто открой сайт и войди по коду.");
      return true;
    }

    const auth = adminAuth();
    let uid: string;
    try {
      const existing = await auth.getUserByEmail(email);
      uid = existing.uid;
    } catch {
      const created = await auth.createUser({ email, displayName });
      uid = created.uid;
      await db.collection("users").doc(uid).set({
        email,
        displayName,
        photoURL: null,
        balance: 0,
        badges: ["user"],
        emailVerified: false,
        banned: false,
        createdAt: Date.now(),
        lastLoginAt: Date.now(),
      });
    }

    await db.collection("telegramLinks").doc(uid).set({ chatId, telegramUsername, linkedAt: Date.now() });

    const loginCode = generateSixDigitCode();
    await db.collection("loginCodes").doc(uid).set({
      code: loginCode,
      createdAt: Date.now(),
      expiresAt: Date.now() + 10 * 60 * 1000,
      attempts: 0,
    });

    await regReqRef.update({ status: "done", uid });
    await sendTelegramMessage(
      chatId,
      `Аккаунт ${SITE_NAME} создан! Код для входа на сайте: ${loginCode}\nВведи его на странице входа (вкладка «Код в Telegram»). Код действителен 10 минут.`
    );
    return true;
  }

  return false;
}

export async function POST(req: NextRequest) {
  if (WEBHOOK_SECRET) {
    const header = req.headers.get("x-telegram-bot-api-secret-token");
    if (header !== WEBHOOK_SECRET) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }
  }

  try {
    const update = await req.json();

    const preCheckout = update?.pre_checkout_query;
    if (preCheckout) {
      await answerPreCheckoutQuery(preCheckout.id, true);
      return NextResponse.json({ ok: true });
    }

    const callback = update?.callback_query;
    if (callback) {
      const chatId: number = callback.message.chat.id;
      const messageId: number = callback.message.message_id;
      const data: string = callback.data;
      const firstName: string = callback.from?.first_name ?? "друг";
      const username: string | null = callback.from?.username ?? null;

      // Участие в конкурсе — единственный callback с содержательным всплывающим текстом (успех/
      // ошибка подписки/уже участвует), поэтому отвечаем на него отдельно и сразу выходим — Telegram
      // не позволяет ответить на один и тот же callback дважды (answerCallbackQuery ниже безусловный).
      if (data.startsWith("contest_join_")) {
        const contestId = data.slice("contest_join_".length);
        const replyText = await handleContestJoin(contestId, chatId, firstName, username);
        await answerCallbackQuery(callback.id, replyText);
        return NextResponse.json({ ok: true });
      }

      await answerCallbackQuery(callback.id);

      if (data === "menu_back") {
        await setBotState(chatId, null);
        await editTelegramMessage(chatId, messageId, mainMenuText(firstName, username), mainMenuButtons(isAdminChat(chatId)));
      } else if (data === "menu_feedback") {
        await setBotState(chatId, null);
        await editTelegramMessage(chatId, messageId, FEEDBACK_MENU_TEXT, feedbackMenuButtons());
      } else if (data === "menu_topup") {
        await setBotState(chatId, "awaiting_topup");
        await editTelegramMessage(chatId, messageId, TOPUP_INSTRUCTIONS, backOnlyButtons("menu_feedback"));
      } else if (data === "menu_support") {
        await setBotState(chatId, "awaiting_support");
        await editTelegramMessage(chatId, messageId, SUPPORT_INSTRUCTIONS, backOnlyButtons("menu_feedback"));
      } else if (data === "menu_partnership") {
        await setBotState(chatId, "awaiting_partnership");
        await editTelegramMessage(chatId, messageId, PARTNERSHIP_INSTRUCTIONS, backOnlyButtons("menu_back"));
      } else if (data === "menu_donate") {
        await setBotState(chatId, "awaiting_donate_amount");
        await editTelegramMessage(chatId, messageId, DONATE_PROMPT_TEXT, backOnlyButtons("menu_back"));
      } else if (data === "cmd_balance") {
        const uid = await findUidByChatId(chatId);
        if (!uid) {
          await sendTelegramMessage(chatId, "Твой Telegram ещё не привязан к аккаунту. Зайди на сайт в «Безопасность» → «Подключить Telegram».");
        } else {
          await sendTelegramMessage(chatId, await getBalanceMessage(uid));
        }
      } else if (data === "cmd_orders") {
        const uid = await findUidByChatId(chatId);
        if (!uid) {
          await sendTelegramMessage(chatId, "Твой Telegram ещё не привязан к аккаунту. Зайди на сайт в «Безопасность» → «Подключить Telegram».");
        } else {
          await sendTelegramMessage(chatId, await getRecentOrdersMessage(uid));
        }
      } else if (isAdminChat(chatId)) {
        if (data === "admin_menu") {
          await setBotState(chatId, null);
          await editTelegramMessage(chatId, messageId, ADMIN_MENU_TEXT, adminMenuButtons());
        } else if (data === "admin_sell_requests") {
          await sendPendingSellRequests(chatId);
        } else if (data === "admin_topups") {
          await sendPendingTopUps(chatId);
        } else if (data === "admin_promo_menu") {
          await editTelegramMessage(chatId, messageId, "🎁 Промокоды:", promoMenuButtons());
        } else if (data === "admin_promo_new") {
          await setBotState(chatId, "admin_awaiting_promo_create");
          await sendTelegramMessage(chatId, PROMO_CREATE_INSTRUCTIONS);
        } else if (data === "admin_promo_list") {
          await sendActivePromoCodes(chatId);
        } else if (data === "admin_contest_menu") {
          await editTelegramMessage(chatId, messageId, CONTEST_MENU_TEXT, contestMenuButtons());
        } else if (data === "contest_new") {
          await startContestWizard(chatId);
        } else if (data === "contest_active_list") {
          await sendActiveContestsList(chatId);
        } else if (data.startsWith("contest_color_")) {
          await handleContestColorChoice(chatId, messageId, data.slice("contest_color_".length));
        } else if (data.startsWith("sell_approve_")) {
          await approveSellRequestFromBot(chatId, messageId, data.slice("sell_approve_".length));
        } else if (data.startsWith("sell_reject_")) {
          await rejectSellRequestFromBot(chatId, messageId, data.slice("sell_reject_".length));
        } else if (data.startsWith("topup_approve_")) {
          await approveTopUpFromBot(chatId, messageId, data.slice("topup_approve_".length));
        } else if (data.startsWith("topup_reject_")) {
          await rejectTopUpFromBot(chatId, messageId, data.slice("topup_reject_".length));
        } else if (data.startsWith("promo_deactivate_")) {
          await deactivatePromoCodeFromBot(chatId, messageId, data.slice("promo_deactivate_".length));
        }
      }

      return NextResponse.json({ ok: true });
    }

    const message = update?.message;
    if (!message) return NextResponse.json({ ok: true });

    const chatId: number | undefined = message?.chat?.id;
    if (!chatId) return NextResponse.json({ ok: true });

    if (message.successful_payment) {
      const totalAmount = message.successful_payment.total_amount;
      const firstName: string = message.from?.first_name ?? "друг";
      const userTag = message.from?.username ? `@${message.from.username}` : `id${chatId}`;
      await sendTelegramMessage(chatId, `Спасибо за поддержку — ${totalAmount} ⭐! 💫`);
      if (ADMIN_CHAT_ID) {
        await sendTelegramMessage(ADMIN_CHAT_ID, `💫 Донат от ${firstName} (${userTag}): ${totalAmount} ⭐`);
      }
      return NextResponse.json({ ok: true });
    }

    // Фото для поста конкурса (см. lib/telegramContests.ts → handleContestPhotoStep) — приходит
    // без message.text, поэтому обрабатывается отдельной веткой ДО общей проверки на текст ниже,
    // иначе такое сообщение молча терялось бы.
    if (message.photo && isAdminChat(chatId)) {
      const mode = await getBotState(chatId);
      if (mode === "admin_contest_photo") {
        // Telegram присылает несколько размеров одного фото — берём последний (самый большой).
        const largest = message.photo[message.photo.length - 1];
        await handleContestPhotoStep(chatId, largest.file_id, false);
        return NextResponse.json({ ok: true });
      }
    }

    const text: string | undefined = message?.text;
    if (!text) return NextResponse.json({ ok: true });

    const firstName: string = message?.from?.first_name ?? "друг";
    const telegramUsername: string | null = message?.from?.username ?? null;

    if (isAdminChat(chatId) && message.reply_to_message) {
      const mapping = await findForwardedMessage(message.reply_to_message.message_id);
      if (mapping) {
        await sendTelegramMessage(mapping.chatId, `💬 Ответ от ${SITE_NAME}:\n\n${text}`);
        await sendTelegramMessage(chatId, `✅ Отправлено пользователю ${mapping.userTag}`);
        return NextResponse.json({ ok: true });
      }
    }

    if (text.startsWith("/start")) {
      const parts = text.trim().split(/\s+/);
      const code = parts[1];

      const handled = code ? await handleAccountLinking(code, chatId, telegramUsername) : false;
      if (!handled) {
        await setBotState(chatId, null);
        await sendTelegramMessage(chatId, mainMenuText(firstName, telegramUsername), mainMenuButtons(isAdminChat(chatId)));
      }
      return NextResponse.json({ ok: true });
    }

    if (text.startsWith("/admin")) {
      if (!isAdminChat(chatId)) return NextResponse.json({ ok: true });
      await setBotState(chatId, null);
      await sendTelegramMessage(chatId, ADMIN_MENU_TEXT, adminMenuButtons());
      return NextResponse.json({ ok: true });
    }

    if (text.startsWith("/balance") || text.startsWith("/orders")) {
      const uid = await findUidByChatId(chatId);
      if (!uid) {
        await sendTelegramMessage(chatId, "Твой Telegram ещё не привязан к аккаунту. Зайди на сайт в «Безопасность» → «Подключить Telegram».");
      } else if (text.startsWith("/balance")) {
        await sendTelegramMessage(chatId, await getBalanceMessage(uid));
      } else {
        await sendTelegramMessage(chatId, await getRecentOrdersMessage(uid));
      }
      return NextResponse.json({ ok: true });
    }

    const mode = await getBotState(chatId);
    const userTag = telegramUsername ? `@${telegramUsername}` : `id${chatId}`;

    if (mode === "admin_awaiting_promo_create" && isAdminChat(chatId)) {
      const reply = await createPromoCodeFromText(text);
      await sendTelegramMessage(chatId, reply);
      await setBotState(chatId, null);
    } else if (mode === "admin_contest_winners" && isAdminChat(chatId)) {
      await handleContestWinnersStep(chatId, text);
    } else if (mode === "admin_contest_photo" && isAdminChat(chatId)) {
      // Сюда попадаем только если это НЕ фото (см. отдельную ветку message.photo выше) — то есть
      // ожидаем текстовое "пропустить", любой другой текст просим прислать фото или пропустить явно.
      if (text.trim().toLowerCase().includes("пропустить")) {
        await handleContestPhotoStep(chatId, null, true);
      } else {
        await sendTelegramMessage(chatId, "Пришли фото или напиши «пропустить».");
      }
    } else if (mode === "admin_contest_text" && isAdminChat(chatId)) {
      await handleContestTextStep(chatId, text);
    } else if (mode === "admin_contest_button_text" && isAdminChat(chatId)) {
      await handleContestButtonTextStep(chatId, text);
    } else if (mode === "admin_contest_channel" && isAdminChat(chatId)) {
      await handleContestChannelStep(chatId, text);
    } else if (mode === "awaiting_donate_amount") {
      const amount = Number(text.trim());
      if (!Number.isInteger(amount) || amount < DONATE_MIN || amount > DONATE_MAX) {
        await sendTelegramMessage(chatId, `Введи целое число от ${DONATE_MIN} до ${DONATE_MAX}.`);
        return NextResponse.json({ ok: true });
      }
      await sendInvoice(chatId, "Поддержка проекта", `Донат ${SITE_NAME} — ${amount} ⭐`, `donate_${chatId}_${Date.now()}`, amount);
      await setBotState(chatId, null);
    } else if (mode === "awaiting_topup") {
      await forwardToAdmin("topup", chatId, firstName, userTag, text);
      await sendTelegramMessage(chatId, "Спасибо! Администратор скоро свяжется с тобой.", backOnlyButtons("menu_back"));
      await setBotState(chatId, null);
    } else if (mode === "awaiting_support") {
      await forwardToAdmin("support", chatId, firstName, userTag, text);
      await sendTelegramMessage(chatId, "Обращение принято, администратор скоро ответит.", backOnlyButtons("menu_back"));
      await setBotState(chatId, null);
    } else if (mode === "awaiting_partnership" || text.trim().toLowerCase().includes(PARTNERSHIP_TRIGGER)) {
      await forwardToAdmin("partnership", chatId, firstName, userTag, text);
      await sendTelegramMessage(chatId, "Заявка на сотрудничество отправлена. Ожидай ответа администратора.", backOnlyButtons("menu_back"));
      await setBotState(chatId, null);
    } else {
      await sendTelegramMessage(chatId, mainMenuText(firstName, telegramUsername), mainMenuButtons(isAdminChat(chatId)));
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Telegram webhook error:", err);
    return NextResponse.json({ ok: true });
  }
}
