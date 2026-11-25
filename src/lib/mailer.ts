/**
 * Отправка почты через SendGrid (sendgrid.com) — обычный HTTP-запрос к их API. Плюс перед Brevo:
 * не нужно подтверждать целый домен — только ОДИН email-адрес (Single Sender Verification),
 * подтверждается за одну минуту простым кликом по ссылке в письме от SendGrid. После этого можно
 * слать на любые адреса. Бесплатный тариф: 100 писем в день навсегда.
 *
 * Настройка (5 минут):
 *  1. Зарегистрируйся на https://signup.sendgrid.com (тоже попросят подтвердить телефон —
 *     виртуальные/VoIP номера обычно не проходят, нужен настоящий)
 *  2. Settings → Sender Authentication → Single Sender Verification → Create New Sender →
 *     укажи любую свою настоящую почту (даже обычный Gmail подойдёт) → SendGrid пришлёт письмо
 *     с кнопкой подтверждения на эту почту → нажми
 *  3. Settings → API Keys → Create API Key → права "Full Access" (или хотя бы "Mail Send") →
 *     скопируй ключ (показывается только один раз!)
 *
 * Переменные окружения:
 *   SENDGRID_API_KEY=SG.xxxxxxxx
 *   SENDGRID_FROM_EMAIL=<та самая подтверждённая на шаге 2 почта>
 *   SENDGRID_FROM_NAME=Velox Trade (необязательно)
 */
export async function sendMail(to: string, subject: string, html: string): Promise<void> {
  const apiKey = process.env.SENDGRID_API_KEY;
  const fromEmail = process.env.SENDGRID_FROM_EMAIL;
  const fromName = process.env.SENDGRID_FROM_NAME || "Velox Trade";

  if (!apiKey || !fromEmail) {
    throw new Error("SendGrid не настроен — задай SENDGRID_API_KEY и SENDGRID_FROM_EMAIL в переменных окружения");
  }

  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: fromEmail, name: fromName },
      subject,
      content: [{ type: "text/html", value: html }],
    }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    console.error("SendGrid send error:", res.status, errBody);
    throw new Error("Не удалось отправить письмо через SendGrid");
  }
}
