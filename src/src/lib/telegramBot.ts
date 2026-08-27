const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

export interface InlineButton {
  text: string;
  callback_data?: string;
  url?: string;
}

async function tgCall<T = unknown>(method: string, body: Record<string, unknown>): Promise<T | null> {
  if (!BOT_TOKEN) return null;
  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!data.ok) return null;
    return data.result as T;
  } catch {
    return null;
  }
}

/** Возвращает message_id отправленного сообщения (нужно, чтобы потом распознать Reply админа
 * на него) или null при ошибке. */
export async function sendTelegramMessage(chatId: number, text: string, buttons?: InlineButton[][]): Promise<number | null> {
  const result = await tgCall<{ message_id: number }>("sendMessage", {
    chat_id: chatId,
    text,
    reply_markup: buttons ? { inline_keyboard: buttons } : undefined,
  });
  return result?.message_id ?? null;
}

export async function sendTelegramPhoto(chatId: number, photoUrl: string, caption?: string, buttons?: InlineButton[][]): Promise<boolean> {
  const result = await tgCall("sendPhoto", {
    chat_id: chatId,
    photo: photoUrl,
    caption,
    reply_markup: buttons ? { inline_keyboard: buttons } : undefined,
  });
  return result !== null;
}

export async function editTelegramMessage(chatId: number, messageId: number, text: string, buttons?: InlineButton[][]): Promise<boolean> {
  const result = await tgCall("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    reply_markup: buttons ? { inline_keyboard: buttons } : undefined,
  });
  return result !== null;
}

export async function answerCallbackQuery(callbackQueryId: string, text?: string): Promise<boolean> {
  const result = await tgCall("answerCallbackQuery", { callback_query_id: callbackQueryId, text });
  return result !== null;
}

export async function sendInvoice(chatId: number, title: string, description: string, payload: string, amountStars: number): Promise<boolean> {
  const result = await tgCall("sendInvoice", {
    chat_id: chatId,
    title,
    description,
    payload,
    currency: "XTR",
    prices: [{ label: title, amount: amountStars }],
  });
  return result !== null;
}

export async function answerPreCheckoutQuery(preCheckoutQueryId: string, ok: boolean, errorMessage?: string): Promise<boolean> {
  const result = await tgCall("answerPreCheckoutQuery", { pre_checkout_query_id: preCheckoutQueryId, ok, error_message: errorMessage });
  return result !== null;
}

export function generateSixDigitCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}
