import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebaseAdmin";
import { sendMail } from "@/lib/mailer";
import { rateLimit, clientIp } from "@/lib/rateLimit";

export const runtime = "nodejs";

/**
 * Сброс пароля. КРИТИЧНО: раньше этот роут возвращал ссылку для сброса прямо в ответе — любой,
 * кто знал email (в том числе админа), мог получить ссылку и захватить аккаунт, не имея доступа к
 * почте. Теперь ссылка уходит ТОЛЬКО письмом на сам адрес, а ответ всегда одинаковый (не раскрывает,
 * есть ли такой аккаунт). Плюс лимиты по IP и по адресу.
 */
export async function POST(req: NextRequest) {
  const generic = NextResponse.json({ ok: true });
  try {
    const { email } = await req.json().catch(() => ({}));
    if (!email || typeof email !== "string" || email.length > 200) {
      return NextResponse.json({ error: "Укажи email" }, { status: 400 });
    }
    const normalized = email.trim().toLowerCase();

    if (!(await rateLimit(`reset-ip:${clientIp(req)}`, 10, 60 * 60 * 1000))) return generic;
    if (!(await rateLimit(`reset-mail:${normalized}`, 3, 60 * 60 * 1000))) return generic;

    let resetLink: string;
    try {
      resetLink = await adminAuth().generatePasswordResetLink(normalized);
    } catch {
      return generic; // такого аккаунта нет — отвечаем так же
    }

    try {
      await sendMail(
        normalized,
        "Сброс пароля Velox Trade",
        `<p>Вы (или кто-то другой) запросили сброс пароля.</p><p><a href="${resetLink}">Задать новый пароль</a></p><p style="color:#888;font-size:12px">Если это были не вы — просто проигнорируйте письмо. Мы никогда не просим пароль или коды из писем.</p>`
      );
    } catch (err) {
      console.error("send-reset-email: не удалось отправить письмо", err);
    }
    return generic;
  } catch (err) {
    console.error("send-reset-email error:", err);
    return generic;
  }
}
