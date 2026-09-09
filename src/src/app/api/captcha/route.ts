import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";

export const runtime = "nodejs";

const SECRET = process.env.CAPTCHA_SECRET || "dev-fallback-secret-change-me";

/**
 * Своя капча вместо reCAPTCHA/App Check — простой вопрос "сколько будет A + B", без картинок,
 * без Google, без внешних сервисов, которые могут отвалиться из-за неверной настройки домена/
 * ключа (что и произошло с App Check). Задача и правильный ответ не хранятся на сервере между
 * запросами — сам ответ зашит в подписанный HMAC-токен, который возвращается вместе с вопросом,
 * и клиент присылает его обратно вместе со своим ответом при проверке (см. POST ниже). Подделать
 * токен нельзя, не зная CAPTCHA_SECRET, а расшифровать ответ из токена нельзя, не имея секрета —
 * это ровно то же свойство, что даёт JWT, просто без лишней библиотеки.
 */
export async function GET() {
  const a = Math.floor(Math.random() * 8) + 2; // 2..9
  const b = Math.floor(Math.random() * 8) + 2;
  const answer = a + b;

  const payload = { answer, issuedAt: Date.now() };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", SECRET).update(payloadB64).digest("hex");
  const challengeToken = `${payloadB64}.${signature}`;

  return NextResponse.json({ question: `${a} + ${b} = ?`, challengeToken });
}

export async function POST(req: NextRequest) {
  try {
    const { challengeToken, userAnswer } = await req.json();
    if (typeof challengeToken !== "string" || typeof userAnswer !== "number") {
      return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
    }

    const [payloadB64, signature] = challengeToken.split(".");
    if (!payloadB64 || !signature) return NextResponse.json({ error: "Некорректный токен" }, { status: 400 });

    const expectedSig = createHmac("sha256", SECRET).update(payloadB64).digest("hex");
    if (signature !== expectedSig) return NextResponse.json({ error: "Токен повреждён" }, { status: 400 });

    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString());
    if (Date.now() - payload.issuedAt > 5 * 60 * 1000) {
      return NextResponse.json({ error: "Капча устарела, обнови вопрос" }, { status: 400 });
    }
    if (payload.answer !== userAnswer) {
      return NextResponse.json({ error: "Неверный ответ" }, { status: 400 });
    }

    // Ответ верный — выдаём новый токен-пропуск (не путать с challengeToken выше): этот
    // используется дальше как X-Captcha-Token на важных запросах (регистрация, ставки, покупки),
    // см. lib/firebaseAdmin.ts → verifyCaptchaToken. Отдельный от challengeToken, потому что тот
    // содержит ответ на конкретный вопрос и не должен переиспользоваться как пропуск.
    const passPayload = { issuedAt: Date.now() };
    const passPayloadB64 = Buffer.from(JSON.stringify(passPayload)).toString("base64url");
    const passSignature = createHmac("sha256", SECRET).update(passPayloadB64).digest("hex");
    const passToken = `${passPayloadB64}.${passSignature}`;

    return NextResponse.json({ ok: true, passToken });
  } catch (err) {
    console.error("captcha verify error:", err);
    return NextResponse.json({ error: "Не удалось проверить капчу" }, { status: 500 });
  }
}
