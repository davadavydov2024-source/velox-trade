import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { sendMail } from "@/lib/mailer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Email-уведомление конкретному пользователю сайта — та же роль, что у /api/notify/telegram, но
 * почтой. Используется ТОЛЬКО для реальных событий по сделкам (см. lib/orderChats.ts, tickets.ts,
 * sellRequests.ts): сообщение в чате заказа, ответ поддержки, одобрение товара к публикации.
 * Осознанно НЕ подключено к личным сообщениям (directMessages) и обменам (trades) — это шум,
 * не приносит достаточно пользы, чтобы заваливать людям почту на каждое такое событие.
 */
export async function POST(req: NextRequest) {
  try {
    const { uid, subject, html } = await req.json();
    if (!uid || !subject || !html) {
      return NextResponse.json({ ok: false, error: "uid, subject и html обязательны" }, { status: 400 });
    }

    const userSnap = await adminDb().collection("users").doc(uid).get();
    const email: string | undefined = userSnap.data()?.email;
    if (!email) return NextResponse.json({ ok: true, delivered: false });

    await sendMail(email, subject, html);
    return NextResponse.json({ ok: true, delivered: true });
  } catch (err) {
    // Не критично для основного действия (сообщение в чате и т.п. уже сохранено) — просто логируем.
    console.error("notify/email error:", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
