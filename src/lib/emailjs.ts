import emailjs from "@emailjs/browser";

const SERVICE_ID = process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID!;
const TEMPLATE_ID = process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_ID!;
const RESET_TEMPLATE_ID = process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_RESET_ID || TEMPLATE_ID;
const AUTOREPLY_TEMPLATE_ID = process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_AUTOREPLY_ID || TEMPLATE_ID;
const PUBLIC_KEY = process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY!;

interface SendEmailParams {
  to_email: string;
  to_name?: string;
  subject?: string;
  message: string;
  [key: string]: string | undefined;
}

/**
 * Отправляет письмо через EmailJS используя шаблон, заданный в .env.local.
 * Поля передаваемого объекта должны совпадать с переменными в самом шаблоне EmailJS
 * (зайди в EmailJS Dashboard -> Email Templates -> template_qo1n6m8, чтобы проверить названия переменных).
 */
export async function sendEmail(params: SendEmailParams, templateId: string = TEMPLATE_ID) {
  return emailjs.send(SERVICE_ID, templateId, params, { publicKey: PUBLIC_KEY });
}

export async function sendVerificationCodeEmail(toEmail: string, code: string, name?: string) {
  return sendEmail({
    to_email: toEmail,
    to_name: name ?? toEmail,
    subject: "Подтверждение Email — Velox Trade",
    message: `Ваш код подтверждения: ${code}. Он действует 15 минут.`,
    code,
  });
}

export async function sendBroadcastEmail(toEmail: string, title: string, text: string, buttonText?: string, buttonLink?: string) {
  return sendEmail({
    to_email: toEmail,
    subject: title,
    message: text,
    button_text: buttonText ?? "",
    button_link: buttonLink ?? "",
  });
}

/** Автоответ пользователю сразу после создания обращения в поддержку (шаблон template_18ogai3). */
export async function sendSupportAutoReply(toEmail: string, toName: string, subject: string) {
  return sendEmail(
    {
      to_email: toEmail,
      to_name: toName,
      subject: `Обращение принято: ${subject}`,
      message: `Мы получили твоё обращение «${subject}» и ответим в ближайшее время. Следить за статусом можно в разделе Поддержка на сайте.`,
    },
    AUTOREPLY_TEMPLATE_ID
  );
}

/** Письмо восстановления пароля со ссылкой, сгенерированной сервером (шаблон template_u59otfj). */
export async function sendPasswordResetEmailViaTemplate(toEmail: string, resetLink: string) {
  return sendEmail(
    {
      to_email: toEmail,
      subject: "Восстановление пароля — Velox Trade",
      message: "Перейди по ссылке ниже, чтобы задать новый пароль. Если это был не ты — просто проигнорируй письмо.",
      reset_link: resetLink,
      button_link: resetLink,
      button_text: "Сбросить пароль",
    },
    RESET_TEMPLATE_ID
  );
}
