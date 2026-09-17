import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CODE_TTL_MS = 10 * 60 * 1000; // 10 минут
const RESEND_COOLDOWN_MS = 30 * 1000; // не чаще раза в 30 секунд на один email

/**
 * Шаг 1 верификации почты при регистрации: генерируем 6-значный код и кладём письмо в коллекцию
 * "mail" — её разбирает уже настроенное в проекте расширение Firebase "Trigger Email from
 * Firestore" (см. lib/firebaseMail.ts, там та же схема для рассылок, просто в bcc, а не to).
 */
export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();
    const normalized = typeof email === "string" ? email.trim().toLowerCase() : "";
    if (!normalized || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      return NextResponse.json({ error: "Некорректный email" }, { status: 400 });
    }

    const db = adminDb();
    const ref = db.collection("emailVerificationCodes").doc(normalized);
    const snap = await ref.get();
    const existing = snap.exists ? (snap.data() as { createdAt: number }) : null;
    if (existing && Date.now() - existing.createdAt < RESEND_COOLDOWN_MS) {
      return NextResponse.json({ error: "Код уже отправлен, подожди немного перед повторной отправкой" }, { status: 429 });
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    await ref.set({ code, createdAt: Date.now(), attempts: 0, verified: false });

    await db.collection("mail").add({
      to: [normalized],
      message: {
        subject: `${code} — код подтверждения регистрации`,
        html: `<div style="font-family:sans-serif;font-size:15px;line-height:1.6;color:#111;">
          <p>Твой код для завершения регистрации:</p>
          <p style="font-size:28px;font-weight:700;letter-spacing:4px;margin:16px 0;">${code}</p>
          <p style="color:#666;font-size:13px;">Код действует 10 минут. Если ты не запрашивал(а) регистрацию — просто игнорируй это письмо.</p>
        </div>`,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("auth/email-code/send error:", err);
    return NextResponse.json({ error: "Не удалось отправить код" }, { status: 500 });
  }
}
