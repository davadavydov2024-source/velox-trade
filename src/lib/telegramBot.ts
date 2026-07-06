const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

export interface InlineButton {
  text: string;
  callback_data?: string;
  url?: string;
}

async function tgCall(method: string, body: Record<string, unknown>): Promise<boolean> {
  if (!BOT_TOKEN) return false;
  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function sendTelegramMessage(chatId: number, text: string, buttons?: InlineButton[][]): Promise<boolean> {
  return tgCall("sendMessage", {
    chat_id: chatId,
    text,
    reply_markup: buttons ? { inline_keyboard: buttons } : undefined,
  });
}

export async function sendTelegramPhoto(chatId: number, photoUrl: string, caption?: string, buttons?: InlineButton[][]): Promise<boolean> {
  return tgCall("sendPhoto", {
    chat_id: chatId,
    photo: photoUrl,
    caption,
    reply_markup: buttons ? { inline_keyboard: buttons } : undefined,
  });
}

export async function editTelegramMessage(chatId: number, messageId: number, text: string, buttons?: InlineButton[][]): Promise<boolean> {
  return tgCall("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    reply_markup: buttons ? { inline_keyboard: buttons } : undefined,
  });
}

export async function answerCallbackQuery(callbackQueryId: string, text?: string): Promise<boolean> {
  return tgCall("answerCallbackQuery", { callback_query_id: callbackQueryId, text });
}

export function generateSixDigitCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}
