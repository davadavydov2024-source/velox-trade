import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { rateLimit, ipKey } from "@/lib/apiRateLimit";
import { randomCode6, randomToken as secureToken } from "@/lib/secureRandom";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BOT = process.env.NEXT_PUBLIC_TELEGRAM_BOT || "veloxtrade_robot";

function randomToken(): string {
  return secureToken(20);
}

/**
 * Шаг 1 регистрации по паролю: вместо кода на почту (требовал настроенной отправки писем) человек
 * обязательно подключает Telegram-бота. Создаём заявку с 6-значным кодом и отдаём ссылку на бота
 * (start=verify_<token>) — вебхук бота, получив /start, пришлёт этот код прямо в Telegram (см.
 * handleAccountLinking в api/telegram/webhook). Без открытого бота код просто нигде не появится.
 */
export async function POST(req: NextRequest) {
  try {
    if (!(await rateLimit(ipKey(req, "tg_start"), 10, 60 * 60_000))) {
      return NextResponse.json({ error: "Слишком много запросов, попробуй позже" }, { status: 429 });
    }
    const { email } = await req.json();
    const normalized = typeof email === "string" ? email.trim().toLowerCase() : "";
    if (!normalized || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      return NextResponse.json({ error: "Некорректный email" }, { status: 400 });
    }
    try {
      await adminAuth().getUserByEmail(normalized);
      return NextResponse.json({ error: "Этот email уже зарегистрирован — войди в аккаунт" }, { status: 409 });
    } catch {
      // аккаунта с таким email нет — можно продолжать
    }

    const token = randomToken();
    const code = randomCode6();
    await adminDb().collection("tgVerifyRequests").doc(token).set({
      email: normalized,
      code,
      status: "pending",
      attempts: 0,
      createdAt: Date.now(),
    });
    return NextResponse.json({ ok: true, token, botUrl: `https://t.me/${BOT}?start=verify_${token}` });
  } catch (err) {
    console.error("tg-verify/start error:", err);
    return NextResponse.json({ error: "Не удалось начать подтверждение" }, { status: 500 });
  }
}
