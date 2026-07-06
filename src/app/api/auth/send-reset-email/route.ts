import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

const SERVICE_ID = process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID;
const RESET_TEMPLATE_ID = process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_RESET_ID || process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_ID;
const PUBLIC_KEY = process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY;

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();
    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Укажи email" }, { status: 400 });
    }

    const auth = adminAuth();

    let resetLink: string;
    try {
      resetLink = await auth.generatePasswordResetLink(email.trim().toLowerCase());
    } catch {
      // Не раскрываем, существует ли аккаунт — общий положительный ответ в обоих случаях.
      return NextResponse.json({ ok: true });
    }

    if (!SERVICE_ID || !RESET_TEMPLATE_ID || !PUBLIC_KEY) {
      return NextResponse.json(
        { error: "EmailJS не настроен на сервере (проверь переменные окружения)." },
        { status: 500 }
      );
    }

    const emailRes = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        service_id: SERVICE_ID,
        template_id: RESET_TEMPLATE_ID,
        user_id: PUBLIC_KEY,
        template_params: {
          to_email: email,
          subject: "Восстановление пароля — Velox Trade",
          message: "Перейди по ссылке ниже, чтобы задать новый пароль. Если это был не ты — просто проигнорируй письмо.",
          reset_link: resetLink,
          button_link: resetLink,
          button_text: "Сбросить пароль",
        },
      }),
    });

    if (!emailRes.ok) {
      const errText = await emailRes.text();
      console.error("EmailJS reset email failed:", emailRes.status, errText);
      return NextResponse.json({ error: "Не удалось отправить письмо через EmailJS" }, { status: 502 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("send-reset-email error:", err);
    return NextResponse.json({ error: "Не удалось отправить письмо" }, { status: 500 });
  }
}
