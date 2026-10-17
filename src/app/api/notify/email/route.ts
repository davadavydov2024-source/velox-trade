import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { sendMail } from "@/lib/mailer";
import { requireUser } from "@/lib/requireUser";
import { rateLimit } from "@/lib/rateLimit";
import { mayNotify } from "@/lib/notifyAccess";
import { sanitizeEmailHtml } from "@/lib/sanitizeText";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Email-уведомление о реальных событиях по сделкам (чат заказа, ответ поддержки, одобрение товара).
 * Раньше роут был открыт всем: любой мог слать любое письмо любому пользователю от имени сайта.
 * Теперь нужен вход, связь с получателем, лимит частоты, а из HTML вырезаются ссылки и скрипты.
 */
export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    if (!caller) return NextResponse.json({ ok: false, error: "Не авторизован" }, { status: 401 });
    if (!(await rateLimit(`notify_mail_${caller}`, 10, 60_000)) || !(await rateLimit(`notify_mail_day_${caller}`, 100, 86_400_000))) {
      return NextResponse.json({ ok: false, error: "Слишком часто" }, { status: 429 });
    }

    const { uid, subject, html } = await req.json();
    if (typeof uid !== "string" || !uid || uid.length > 128 || typeof subject !== "string" || typeof html !== "string" || !subject || !html) {
      return NextResponse.json({ ok: false, error: "uid, subject и html обязательны" }, { status: 400 });
    }
    if (!(await mayNotify(caller, uid))) return NextResponse.json({ ok: false, error: "Нет доступа" }, { status: 403 });

    const userSnap = await adminDb().collection("users").doc(uid).get();
    const email: string | undefined = userSnap.data()?.email;
    if (!email) return NextResponse.json({ ok: true, delivered: false });

    const safeSubject = subject.replace(/[\r\n]+/g, " ").slice(0, 150);
    await sendMail(email, safeSubject, sanitizeEmailHtml(html));
    return NextResponse.json({ ok: true, delivered: true });
  } catch (err) {
    console.error("notify/email error:", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
