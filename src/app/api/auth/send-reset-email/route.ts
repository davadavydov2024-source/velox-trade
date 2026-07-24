import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

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

    // Саму ссылку генерируем здесь (это требует Admin SDK и может работать только на сервере),
    // а отправку письма через EmailJS делает клиент (см. authContext.tsx) — у EmailJS REST API
    // строгая проверка Origin-заголовка браузера, и серверный fetch с Vercel её не проходит.
    return NextResponse.json({ ok: true, resetLink });
  } catch (err) {
    console.error("send-reset-email error:", err);
    return NextResponse.json({ error: "Не удалось создать ссылку для сброса пароля" }, { status: 500 });
  }
}
