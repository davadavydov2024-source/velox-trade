import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { sendMail } from "@/lib/mailer";
import { requireUser } from "@/lib/adminGuard";
import { rateLimit } from "@/lib/rateLimit";
import { cleanSubject, sanitizeEmailHtml, wrapEmail } from "@/lib/sanitizeNotify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Email-уведомление конкретному пользователю по реальным событиям (чат заказа, ответ поддержки,
 * одобрение товара). Требует входа; тема очищается от переводов строк, HTML — от всего, кроме
 * безобидных тегов (ссылки только на наш сайт), письмо оборачивается предупреждением о
 * мошенничестве; лимиты частоты на отправителя и на получателя. Раньше любой мог слать любому
 * зарегистрированному пользователю письма с произвольным HTML от имени сайта.
 */
export async function POST(req: NextRequest) {
  try {
    const guard = await requireUser(req);
    if ("error" in guard) return guard.error;

    const { uid, subject, html } = await req.json().catch(() => ({}));
    const cleanSub = cleanSubject(subject);
    const cleanHtml = sanitizeEmailHtml(html, guard.isAdmin);
    if (typeof uid !== "string" || !uid || uid.length > 128 || !cleanSub || !cleanHtml) {
      return NextResponse.json({ ok: false, error: "uid, subject и html обязательны" }, { status: 400 });
    }

    if (!guard.isAdmin) {
      if (!(await rateLimit(`mail-from:${guard.uid}`, 30, 60 * 60 * 1000))) return NextResponse.json({ ok: false, error: "Слишком часто" }, { status: 429 });
      if (!(await rateLimit(`mail-to:${uid}`, 10, 60 * 60 * 1000))) return NextResponse.json({ ok: true, delivered: false });
    }

    const userSnap = await adminDb().collection("users").doc(uid).get();
    const email: string | undefined = userSnap.data()?.email;
    // Синтетические адреса (telegram_<id>@telegram.local) — это не настоящая почта.
    if (!email || email.endsWith("@telegram.local")) return NextResponse.json({ ok: true, delivered: false });

    await sendMail(email, cleanSub, wrapEmail(cleanHtml));
    return NextResponse.json({ ok: true, delivered: true });
  } catch (err) {
    console.error("notify/email error:", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
