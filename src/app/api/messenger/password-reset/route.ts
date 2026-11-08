import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { sendMail } from "@/lib/mailer";
import { rateLimit, ipKey } from "@/lib/apiRateLimit";
import { randomCode6, safeEqual } from "@/lib/secureRandom";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CODE_TTL_MS = 10 * 60_000;
const COOLDOWN_MS = 45_000;
const MAX_ATTEMPTS = 5;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const hashCode = (code: string, email: string) => createHash("sha256").update(`${email}:${code}`).digest("hex");
const err = (message: string, status = 400) => NextResponse.json({ error: message }, { status });

/**
 * Сброс пароля по коду из письма — без текущего пароля (подходит и тем, кто вошёл, но не помнит пароль, и тем, кто не может войти).
 *  POST { email }                      -> { ok:true }  отправляет 6-значный код на почту (ответ одинаковый, есть такой аккаунт или нет)
 *  POST { email, code, password }      -> { ok:true }  проверяет код и ставит новый пароль
 * Работает только для аккаунтов с настоящей почтой; у входивших только через Telegram (@telegram.local) пароля нет — им «Добавить почту и пароль» в Настройках.
 */
export async function POST(req: NextRequest) {
  try {
    const b = await req.json().catch(() => ({}));
    const email = String(b.email ?? "").trim().toLowerCase();
    if (!EMAIL_RE.test(email) || email.length > 120) return err("Проверь почту — она записана неверно");
    const db = adminDb();
    const ref = db.collection("passwordResetCodes").doc(email);

    // ---- шаг 2: код + новый пароль ----
    if (b.code !== undefined) {
      if (!(await rateLimit(ipKey(req, "pw_reset_confirm"), 30, 15 * 60_000))) return err("Слишком много попыток. Подожди немного.", 429);
      const code = String(b.code ?? "").trim();
      const password = String(b.password ?? "");
      if (!/^\d{6}$/.test(code)) return err("Код — 6 цифр из письма");
      if (password.length < 8 || password.length > 100) return err("Пароль — от 8 символов");

      const result = await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) return "missing" as const;
        const d = snap.data() as { codeHash: string; createdAt: number; attempts: number; uid: string };
        if (Date.now() - d.createdAt > CODE_TTL_MS) return "expired" as const;
        if (d.attempts >= MAX_ATTEMPTS) return "locked" as const;
        if (!safeEqual(d.codeHash, hashCode(code, email))) { tx.update(ref, { attempts: d.attempts + 1 }); return "wrong" as const; }
        return { uid: d.uid };
      });
      if (result === "missing") return err("Сначала запроси код", 404);
      if (result === "expired") return err("Код устарел — запроси новый", 410);
      if (result === "locked") return err("Слишком много попыток — запроси новый код", 429);
      if (result === "wrong") return err("Неверный код");

      try {
        await adminAuth().updateUser(result.uid, { password, emailVerified: true }); // код из письма доказал владение почтой
      } catch (e: any) {
        return err(e?.code === "auth/invalid-password" ? "Слишком простой пароль" : "Не удалось сменить пароль", 400);
      }
      await ref.delete().catch(() => {});
      return NextResponse.json({ ok: true });
    }

    // ---- шаг 1: отправить код ----
    if (!(await rateLimit(ipKey(req, "pw_reset_send"), 8, 60 * 60_000))) return err("Слишком много запросов, попробуй позже", 429);
    const user = await adminAuth().getUserByEmail(email).catch(() => null);
    if (user && !email.endsWith("@telegram.local")) {
      const existing = (await ref.get()).data() as { createdAt?: number } | undefined;
      if (!existing?.createdAt || Date.now() - existing.createdAt >= COOLDOWN_MS) {
        const code = randomCode6();
        await ref.set({ codeHash: hashCode(code, email), uid: user.uid, createdAt: Date.now(), attempts: 0 });
        await sendMail(
          email,
          `${code} — код для сброса пароля MiliGram`,
          `<div style="font-family:sans-serif;font-size:15px;line-height:1.6;color:#111;">
            <p>Твой код для смены пароля в MiliGram:</p>
            <p style="font-size:28px;font-weight:700;letter-spacing:4px;margin:16px 0;">${code}</p>
            <p style="color:#666;font-size:13px;">Код действует 10 минут. Если ты не просил(а) сброс пароля — просто игнорируй это письмо, твой пароль не изменится.</p>
          </div>`
        );
      }
    }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("messenger/password-reset:", e?.message || e);
    if (String(e?.message ?? "").includes("не настроен")) return err("Отправка почты не настроена на сервере — обратись к разработчику", 500);
    return err("Не удалось выполнить. Попробуй ещё раз", 500);
  }
}
