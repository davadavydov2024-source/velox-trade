import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { sendTelegramMessage, editTelegramMessage, answerCallbackQuery, generateSixDigitCode } from "@/lib/telegramBot";
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
} from "@/lib/telegramMenus";

export const runtime = "nodejs";

const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;
const ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID ? Number(process.env.TELEGRAM_ADMIN_CHAT_ID) : null;

const PARTNERSHIP_TRIGGER = "хочу сотрудничать с velox trade";

async function notifyAdmin(text: string) {
  if (!ADMIN_CHAT_ID) return;
  await sendTelegramMessage(ADMIN_CHAT_ID, text);
}

async function handleAccountLinking(code: string, chatId: number, telegramUsername: string | null): Promise<boolean> {
  const db = adminDb();

  const linkReqRef = db.collection("telegramLinkRequests").doc(code);
  const linkReqSnap = await linkReqRef.get();
  if (linkReqSnap.exists) {
    const { uid } = linkReqSnap.data() as { uid: string };
    await db.collection("telegramLinks").doc(uid).set({ chatId, telegramUsername, linkedAt: Date.now() });
    await linkReqRef.delete();
    await sendTelegramMessage(chatId, "Telegram успешно привязан к твоему аккаунту Velox Trade! Теперь при входе с нового устройства код будет приходить сюда.");
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
      `Аккаунт Velox Trade создан! Код для входа на сайте: ${loginCode}\nВведи его на странице входа (вкладка «Код в Telegram»). Код действителен 10 минут.`
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

    // --- Нажатие на inline-кнопку ---
    const callback = update?.callback_query;
    if (callback) {
      const chatId: number = callback.message.chat.id;
      const messageId: number = callback.message.message_id;
      const data: string = callback.data;
      const firstName: string = callback.from?.first_name ?? "друг";
      const username: string | null = callback.from?.username ?? null;

      await answerCallbackQuery(callback.id);

      if (data === "menu_back") {
        await setBotState(chatId, null);
        await editTelegramMessage(chatId, messageId, mainMenuText(firstName, username), mainMenuButtons());
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
      }

      return NextResponse.json({ ok: true });
    }

    // --- Обычное сообщение ---
    const message = update?.message;
    const text: string | undefined = message?.text;
    const chatId: number | undefined = message?.chat?.id;
    if (!chatId || !text) return NextResponse.json({ ok: true });

    const firstName: string = message?.from?.first_name ?? "друг";
    const telegramUsername: string | null = message?.from?.username ?? null;

    if (text.startsWith("/start")) {
      const parts = text.trim().split(/\s+/);
      const code = parts[1];

      const handled = code ? await handleAccountLinking(code, chatId, telegramUsername) : false;
      if (!handled) {
        await setBotState(chatId, null);
        await sendTelegramMessage(chatId, mainMenuText(firstName, telegramUsername), mainMenuButtons());
      }
      return NextResponse.json({ ok: true });
    }

    // --- Свободный текст: смотрим, в каком режиме находится диалог ---
    const mode = await getBotState(chatId);
    const userTag = telegramUsername ? `@${telegramUsername}` : `id${chatId}`;

    if (mode === "awaiting_topup") {
      await notifyAdmin(`💰 Пополнение/вывод от ${firstName} (${userTag}):\n\n${text}`);
      await sendTelegramMessage(chatId, "Спасибо! Администратор скоро свяжется с тобой.", backOnlyButtons("menu_back"));
      await setBotState(chatId, null);
    } else if (mode === "awaiting_support") {
      await notifyAdmin(`🆘 Поддержка от ${firstName} (${userTag}):\n\n${text}`);
      await sendTelegramMessage(chatId, "Обращение принято, администратор скоро ответит.", backOnlyButtons("menu_back"));
      await setBotState(chatId, null);
    } else if (mode === "awaiting_partnership" || text.trim().toLowerCase().includes(PARTNERSHIP_TRIGGER)) {
      await notifyAdmin(`🤝 Запрос на сотрудничество от ${firstName} (${userTag}):\n\n${text}`);
      await sendTelegramMessage(chatId, "Заявка на сотрудничество отправлена. Ожидай ответа администратора.", backOnlyButtons("menu_back"));
      await setBotState(chatId, null);
    } else {
      await sendTelegramMessage(chatId, mainMenuText(firstName, telegramUsername), mainMenuButtons());
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Telegram webhook error:", err);
    return NextResponse.json({ ok: true });
  }
}
