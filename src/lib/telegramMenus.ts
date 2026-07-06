import { InlineButton } from "./telegramBot";

const SITE_NAME = "Velox Trade";
const CHANNEL_URL = process.env.NEXT_PUBLIC_TELEGRAM_CHANNEL_URL;

export function mainMenuText(firstName: string, username: string | null): string {
  const uname = username ? `@${username}` : "без юзернейма";
  return `Приветствуем ${firstName} (${uname}) в ${SITE_NAME}! Выберите действие, что вам нужно:`;
}

export function mainMenuButtons(): InlineButton[][] {
  const rows: InlineButton[][] = [
    [{ text: "💬 Обратная связь", callback_data: "menu_feedback" }],
    [{ text: "🤝 Сотрудничество", callback_data: "menu_partnership" }],
  ];
  if (CHANNEL_URL) rows.push([{ text: "📢 Наш канал", url: CHANNEL_URL }]);
  return rows;
}

export const FEEDBACK_MENU_TEXT = "Здравствуйте, выберите действие для чего вы выбрали этот режим!";

export function feedbackMenuButtons(): InlineButton[][] {
  return [
    [{ text: "💰 Пополнение / вывод", callback_data: "menu_topup" }],
    [{ text: "🆘 Поддержка", callback_data: "menu_support" }],
    [{ text: "⬅️ Назад", callback_data: "menu_back" }],
  ];
}

export const TOPUP_INSTRUCTIONS =
  "1. Пожалуйста, укажите ваш никнейм и юзернейм на сайте и сумму пополнения или вывода средств.\n" +
  "2. Администратор предоставит QR-код, ссылку на Playerok или FunPay, либо номер телефона.\n\n" +
  "Напишите сообщение прямо сюда — оно уйдёт администратору.";

export const SUPPORT_INSTRUCTIONS =
  "1. Опишите свою проблему.\n2. В скором времени ожидайте ответ от администратора.\n\nНапишите сообщение прямо сюда.";

export const PARTNERSHIP_INSTRUCTIONS =
  `Для сотрудничества напишите "хочу сотрудничать с ${SITE_NAME}", после этого ожидайте ответа администратора и следуйте инструкции, которую он укажет.`;

export function backOnlyButtons(target: "menu_feedback" | "menu_back" = "menu_feedback"): InlineButton[][] {
  return [[{ text: "⬅️ Назад", callback_data: target }]];
}
