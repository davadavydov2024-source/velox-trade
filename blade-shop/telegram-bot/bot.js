/**
 * Velox Trade — автономный Telegram-бот (long polling).
 *
 * Это тот же бот, что раньше работал через вебхук на сайте (src/app/api/telegram/webhook),
 * просто вынесенный в отдельный процесс, который можно запустить на любом хостинге командой
 * `node bot.js` — без домена, без вебхука, без настройки в BotFather (кроме самого токена).
 *
 * Логика ничем не отличается от вебхука на сайте:
 *   - Главное меню + подменю «Обратная связь» (Пополнение/вывод, Поддержка, Сотрудничество)
 *   - Привязка Telegram к существующему аккаунту / регистрация нового аккаунта через /start <код>
 *   - Пересылка сообщений администратору
 *
 * ВАЖНО: у Telegram один бот не может ОДНОВРЕМЕННО работать и через вебхук, и через long polling.
 * При старте скрипт сам удаляет вебхук (если он был установлен на сайте) — с этого момента отвечать
 * на сообщения будет именно этот процесс. Рассылка админом (/admin/ads) и уведомления о заявках
 * на продажу по-прежнему летят напрямую с сайта через Bot API — их этот скрипт не трогает и не заменяет.
 */

const { initializeApp, cert } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");

require("dotenv").config();

// ---------- Конфигурация ----------

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID ? Number(process.env.TELEGRAM_ADMIN_CHAT_ID) : null;
const CHANNEL_URL = process.env.TELEGRAM_CHANNEL_URL || process.env.NEXT_PUBLIC_TELEGRAM_CHANNEL_URL || "";
const SITE_NAME = process.env.SITE_NAME || "Velox Trade";

if (!BOT_TOKEN) {
  console.error("Не задан TELEGRAM_BOT_TOKEN в .env — без него бот работать не может.");
  process.exit(1);
}

const PROJECT_ID = process.env.FIREBASE_ADMIN_PROJECT_ID;
const CLIENT_EMAIL = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
const PRIVATE_KEY = (process.env.FIREBASE_ADMIN_PRIVATE_KEY || "").replace(/\\n/g, "\n");

if (!PROJECT_ID || !CLIENT_EMAIL || !PRIVATE_KEY) {
  console.error(
    "Не заданы FIREBASE_ADMIN_PROJECT_ID / FIREBASE_ADMIN_CLIENT_EMAIL / FIREBASE_ADMIN_PRIVATE_KEY в .env.\n" +
      "Возьми те же значения, что и в .env.local сайта (раздел Firebase Admin)."
  );
  process.exit(1);
}

const app = initializeApp({ credential: cert({ projectId: PROJECT_ID, clientEmail: CLIENT_EMAIL, privateKey: PRIVATE_KEY }) });
const auth = getAuth(app);
const db = getFirestore(app);

const API_BASE = `https://api.telegram.org/bot${BOT_TOKEN}`;

// ---------- Низкоуровневые вызовы Telegram Bot API ----------

async function tgCall(method, body) {
  try {
    const res = await fetch(`${API_BASE}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      console.error(`Telegram API ${method} вернул ошибку:`, data);
    }
    return data;
  } catch (err) {
    console.error(`Telegram API ${method} — сетевая ошибка:`, err.message);
    return null;
  }
}

function sendMessage(chatId, text, buttons) {
  return tgCall("sendMessage", { chat_id: chatId, text, reply_markup: buttons ? { inline_keyboard: buttons } : undefined });
}

function editMessage(chatId, messageId, text, buttons) {
  return tgCall("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    reply_markup: buttons ? { inline_keyboard: buttons } : undefined,
  });
}

function answerCallbackQuery(callbackQueryId, text) {
  return tgCall("answerCallbackQuery", { callback_query_id: callbackQueryId, text });
}

function generateSixDigitCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function notifyAdmin(text) {
  if (!ADMIN_CHAT_ID) return;
  await sendMessage(ADMIN_CHAT_ID, text);
}

// ---------- Тексты и клавиатуры меню (как в src/lib/telegramMenus.ts) ----------

function mainMenuText(firstName, username) {
  const uname = username ? `@${username}` : "без юзернейма";
  return `Приветствуем ${firstName} (${uname}) в ${SITE_NAME}! Выберите действие, что вам нужно:`;
}

function mainMenuButtons() {
  const rows = [[{ text: "💬 Обратная связь", callback_data: "menu_feedback" }], [{ text: "🤝 Сотрудничество", callback_data: "menu_partnership" }]];
  if (CHANNEL_URL) rows.push([{ text: "📢 Наш канал", url: CHANNEL_URL }]);
  return rows;
}

const FEEDBACK_MENU_TEXT = "Здравствуйте, выберите действие для чего вы выбрали этот режим!";

function feedbackMenuButtons() {
  return [
    [{ text: "💰 Пополнение / вывод", callback_data: "menu_topup" }],
    [{ text: "🆘 Поддержка", callback_data: "menu_support" }],
    [{ text: "⬅️ Назад", callback_data: "menu_back" }],
  ];
}

const TOPUP_INSTRUCTIONS =
  "1. Пожалуйста, укажите ваш никнейм и юзернейм на сайте и сумму пополнения или вывода средств.\n" +
  "2. Администратор предоставит QR-код, ссылку на Playerok или FunPay, либо номер телефона.\n\n" +
  "Напишите сообщение прямо сюда — оно уйдёт администратору.";

const SUPPORT_INSTRUCTIONS = "1. Опишите свою проблему.\n2. В скором времени ожидайте ответ от администратора.\n\nНапишите сообщение прямо сюда.";

const PARTNERSHIP_INSTRUCTIONS = `Для сотрудничества напишите "хочу сотрудничать с ${SITE_NAME}", после этого ожидайте ответа администратора и следуйте инструкции, которую он укажет.`;

const PARTNERSHIP_TRIGGER = `хочу сотрудничать с ${SITE_NAME}`.toLowerCase();

function backOnlyButtons(target = "menu_feedback") {
  return [[{ text: "⬅️ Назад", callback_data: target }]];
}

// ---------- Состояние диалога (Firestore: telegramBotState — как на сайте) ----------

async function getBotState(chatId) {
  const snap = await db.collection("telegramBotState").doc(String(chatId)).get();
  if (!snap.exists) return null;
  return snap.data()?.mode ?? null;
}

async function setBotState(chatId, mode) {
  await db.collection("telegramBotState").doc(String(chatId)).set({ mode, updatedAt: Date.now() });
}

// ---------- Привязка / регистрация аккаунта через /start <код> (как в вебхуке на сайте) ----------

async function handleAccountLinking(code, chatId, telegramUsername) {
  const linkReqRef = db.collection("telegramLinkRequests").doc(code);
  const linkReqSnap = await linkReqRef.get();
  if (linkReqSnap.exists) {
    const { uid } = linkReqSnap.data();
    await db.collection("telegramLinks").doc(uid).set({ chatId, telegramUsername, linkedAt: Date.now() });
    await linkReqRef.delete();
    await sendMessage(chatId, `Telegram успешно привязан к твоему аккаунту ${SITE_NAME}! Теперь при входе с нового устройства код будет приходить сюда.`);
    return true;
  }

  const regReqRef = db.collection("telegramRegisterRequests").doc(code);
  const regReqSnap = await regReqRef.get();
  if (regReqSnap.exists) {
    const { email, displayName, status } = regReqSnap.data();

    if (status === "done") {
      await sendMessage(chatId, "Этот аккаунт уже зарегистрирован. Просто открой сайт и войди по коду.");
      return true;
    }

    let uid;
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
    await sendMessage(
      chatId,
      `Аккаунт ${SITE_NAME} создан! Код для входа на сайте: ${loginCode}\nВведи его на странице входа (вкладка «Код в Telegram»). Код действителен 10 минут.`
    );
    return true;
  }

  return false;
}

// ---------- Обработка одного Update (то же самое, что было в POST-хендлере вебхука) ----------

async function handleUpdate(update) {
  try {
    const callback = update.callback_query;
    if (callback) {
      const chatId = callback.message.chat.id;
      const messageId = callback.message.message_id;
      const data = callback.data;
      const firstName = callback.from?.first_name ?? "друг";
      const username = callback.from?.username ?? null;

      await answerCallbackQuery(callback.id);

      if (data === "menu_back") {
        await setBotState(chatId, null);
        await editMessage(chatId, messageId, mainMenuText(firstName, username), mainMenuButtons());
      } else if (data === "menu_feedback") {
        await setBotState(chatId, null);
        await editMessage(chatId, messageId, FEEDBACK_MENU_TEXT, feedbackMenuButtons());
      } else if (data === "menu_topup") {
        await setBotState(chatId, "awaiting_topup");
        await editMessage(chatId, messageId, TOPUP_INSTRUCTIONS, backOnlyButtons("menu_feedback"));
      } else if (data === "menu_support") {
        await setBotState(chatId, "awaiting_support");
        await editMessage(chatId, messageId, SUPPORT_INSTRUCTIONS, backOnlyButtons("menu_feedback"));
      } else if (data === "menu_partnership") {
        await setBotState(chatId, "awaiting_partnership");
        await editMessage(chatId, messageId, PARTNERSHIP_INSTRUCTIONS, backOnlyButtons("menu_back"));
      }
      return;
    }

    const message = update.message;
    const text = message?.text;
    const chatId = message?.chat?.id;
    if (!chatId || !text) return;

    const firstName = message.from?.first_name ?? "друг";
    const telegramUsername = message.from?.username ?? null;

    if (text.startsWith("/start")) {
      const parts = text.trim().split(/\s+/);
      const code = parts[1];
      const handled = code ? await handleAccountLinking(code, chatId, telegramUsername) : false;
      if (!handled) {
        await setBotState(chatId, null);
        await sendMessage(chatId, mainMenuText(firstName, telegramUsername), mainMenuButtons());
      }
      return;
    }

    const mode = await getBotState(chatId);
    const userTag = telegramUsername ? `@${telegramUsername}` : `id${chatId}`;

    if (mode === "awaiting_topup") {
      await notifyAdmin(`💰 Пополнение/вывод от ${firstName} (${userTag}):\n\n${text}`);
      await sendMessage(chatId, "Спасибо! Администратор скоро свяжется с тобой.", backOnlyButtons("menu_back"));
      await setBotState(chatId, null);
    } else if (mode === "awaiting_support") {
      await notifyAdmin(`🆘 Поддержка от ${firstName} (${userTag}):\n\n${text}`);
      await sendMessage(chatId, "Обращение принято, администратор скоро ответит.", backOnlyButtons("menu_back"));
      await setBotState(chatId, null);
    } else if (mode === "awaiting_partnership" || text.trim().toLowerCase().includes(PARTNERSHIP_TRIGGER)) {
      await notifyAdmin(`🤝 Запрос на сотрудничество от ${firstName} (${userTag}):\n\n${text}`);
      await sendMessage(chatId, "Заявка на сотрудничество отправлена. Ожидай ответа администратора.", backOnlyButtons("menu_back"));
      await setBotState(chatId, null);
    } else {
      await sendMessage(chatId, mainMenuText(firstName, telegramUsername), mainMenuButtons());
    }
  } catch (err) {
    console.error("Ошибка обработки update:", err);
  }
}

// ---------- Long polling ----------

let offset = 0;

async function pollLoop() {
  for (;;) {
    let updates = null;
    try {
      const res = await fetch(`${API_BASE}/getUpdates?timeout=30&offset=${offset}`);
      const data = await res.json();
      if (!data.ok) {
        console.error("getUpdates вернул ошибку:", data);
        await sleep(3000);
        continue;
      }
      updates = data.result;
    } catch (err) {
      console.error("Не удалось получить обновления, повтор через 3с:", err.message);
      await sleep(3000);
      continue;
    }

    for (const update of updates) {
      offset = update.update_id + 1;
      await handleUpdate(update);
    }
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  // Вебхук и long polling несовместимы — снимаем вебхук (если он был настроен на сайте),
  // чтобы Telegram начал отдавать обновления сюда, через getUpdates.
  await tgCall("deleteWebhook", { drop_pending_updates: false });

  const me = await tgCall("getMe", {});
  if (me?.ok) {
    console.log(`✅ Бот @${me.result.username} запущен (long polling). Ctrl+C — остановить.`);
  } else {
    console.log("✅ Бот запущен (long polling), но не удалось получить его имя — проверь TELEGRAM_BOT_TOKEN.");
  }

  await pollLoop();
}

main().catch((err) => {
  console.error("Критическая ошибка бота:", err);
  process.exit(1);
});
