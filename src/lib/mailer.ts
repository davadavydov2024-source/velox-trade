/**
 * Отправка почты через Resend (resend.com) — обычный HTTP-запрос к их API, без SMTP и без
 * плясок с паролями приложений Gmail/Яндекса (которые у части аккаунтов Google просто
 * недоступны без объяснения причин). Бесплатный тариф Resend: 100 писем/день, 3000/месяц —
 * с головой хватает для кодов регистрации и уведомлений.
 *
 * Настройка (5 минут):
 *  1. Зарегистрируйся на https://resend.com (можно через Google/GitHub)
 *  2. Dashboard → API Keys → Create API Key → скопируй ключ (начинается с "re_")
 *  3. Без верификации своего домена можно слать только с адреса onboarding@resend.dev — этого
 *     достаточно, чтобы всё заработало прямо сейчас. Позже, если захочешь слать с адреса вида
 *     noreply@твойсайт.ru, привяжи домен в Resend (Domains → Add Domain, там же дадут DNS-записи).
 *
 * Переменные окружения:
 *   RESEND_API_KEY=re_xxxxxxxx
 *   RESEND_FROM_EMAIL=onboarding@resend.dev   (или свой адрес после верификации домена)
 *   RESEND_FROM_NAME=Velox Trade              (необязательно)
 */
export async function sendMail(to: string, subject: string, html: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";
  const fromName = process.env.RESEND_FROM_NAME || "Velox Trade";

  if (!apiKey) {
    throw new Error("Resend не настроен — задай RESEND_API_KEY в переменных окружения");
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `${fromName} <${fromEmail}>`,
      to: [to],
      subject,
      html,
    }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    console.error("Resend send error:", res.status, errBody);
    throw new Error("Не удалось отправить письмо через Resend");
  }
}
